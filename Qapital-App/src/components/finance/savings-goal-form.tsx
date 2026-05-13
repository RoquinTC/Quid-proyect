'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogStickyFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { CurrencyInput } from '@/components/ui/currency-input'
import {
  PiggyBank, Calendar, Plus, Link2, Banknote, TrendingUp,
  AlertCircle, ArrowRightLeft, Wallet, Unlink
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { apiFetch } from '@/lib/api'
import type { SubAccount, Account, CDT } from '@/lib/types'

interface LinkedAccountItem {
  accountId: string
  subAccountId?: string | null
  label: string
  balance: number
}

interface SavingsGoalFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingGoal?: any
  onSuccess?: (goal: any) => void
}

// ─── Day helpers ─────────────────────────────────────────────────────────────
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1)
const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
]

const WEEK_LABELS = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4']
const BIWEEKLY_LABELS = ['Primera quincena', 'Segunda quincena']

// ─── Component ───────────────────────────────────────────────────────────────
export function SavingsGoalForm({ open, onOpenChange, editingGoal, onSuccess }: SavingsGoalFormProps) {
  // Basic fields
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [frequency, setFrequency] = useState<'mensual' | 'quincenal' | 'semanal'>('mensual')

  // Frequency-specific fields
  const [monthlyDay, setMonthlyDay] = useState(1)
  const [biweeklyDay1, setBiweeklyDay1] = useState(1)
  const [biweeklyDay2, setBiweeklyDay2] = useState(15)
  const [weeklyDay, setWeeklyDay] = useState(1)

  // Period amounts
  const [biweeklyAmounts, setBiweeklyAmounts] = useState<[number, number]>([0, 0])
  const [weeklyAmounts, setWeeklyAmounts] = useState<[number, number, number, number]>([0, 0, 0, 0])

  // Accounts
  const [sourceAccountId, setSourceAccountId] = useState<string>('')
  const [destinationAccountId, setDestinationAccountId] = useState<string>('')

  // Linked CDTs
  const [selectedCDTIds, setSelectedCDTIds] = useState<string[]>([])
  const [showCDTDialog, setShowCDTDialog] = useState(false)

  // Linked accounts
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccountItem[]>([])

  // New CDT form
  const [newCDTAmount, setNewCDTAmount] = useState('')
  const [newCDTTerm, setNewCDTTerm] = useState(90)
  const [newCDTRate, setNewCDTRate] = useState('')
  const [newCDTBank, setNewCDTBank] = useState('')

  // Data
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cdts, setCDTs] = useState<CDT[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ─── Computed: Monthly Quota ─────────────────────────────────────────────────
  const targetNum = parseFloat(targetAmount) || 0
  const monthsRemaining = deadline
    ? Math.max(1, Math.ceil(
        (new Date(deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30)
      ))
    : 0

  // CDTs linked reduce the remaining amount (only invested value, not expected returns)
  const linkedCDTTotal = cdts
    .filter(c => selectedCDTIds.includes(c.id))
    .reduce((sum, c) => sum + c.amount, 0)

  // Linked account balances also count towards the goal
  const linkedAccountsTotal = linkedAccounts.reduce((sum, a) => sum + a.balance, 0)

  const totalAlreadyCovered = linkedCDTTotal + linkedAccountsTotal
  const remainingAmount = Math.max(0, targetNum - totalAlreadyCovered)
  const monthlyQuota = monthsRemaining > 0 ? remainingAmount / monthsRemaining : 0

  // ─── Auto-distribute amounts when monthly quota changes ──────────────────────
  useEffect(() => {
    if (frequency === 'quincenal' && monthlyQuota > 0) {
      setBiweeklyAmounts([
        Math.round(monthlyQuota / 2),
        Math.round(monthlyQuota / 2)
      ])
    }
  }, [monthlyQuota, frequency])

  useEffect(() => {
    if (frequency === 'semanal' && monthlyQuota > 0) {
      const weekAmt = Math.round(monthlyQuota / 4)
      setWeeklyAmounts([weekAmt, weekAmt, weekAmt, weekAmt])
    }
  }, [monthlyQuota, frequency])

  // ─── Handle biweekly amount change with auto-liquidation ────────────────────
  const handleBiweeklyAmountChange = useCallback((index: 0 | 1, value: string) => {
    const numValue = parseFloat(value) || 0
    setBiweeklyAmounts(prev => {
      const otherIndex = index === 0 ? 1 : 0
      const otherValue = Math.max(0, monthlyQuota - numValue)
      const newAmounts: [number, number] = [0, 0]
      newAmounts[index] = numValue
      newAmounts[otherIndex] = Math.round(otherValue)
      return newAmounts
    })
  }, [monthlyQuota])

  // ─── Handle weekly amount change with auto-liquidation ─────────────────────
  const handleWeeklyAmountChange = useCallback((index: number, value: string) => {
    const numValue = parseFloat(value) || 0
    setWeeklyAmounts(prev => {
      const newAmounts = [...prev] as [number, number, number, number]
      newAmounts[index] = numValue
      const remaining = Math.max(0, monthlyQuota - numValue)
      const otherIndices = [0, 1, 2, 3].filter(i => i !== index)
      const otherCurrentSum = otherIndices.reduce((sum, i) => sum + prev[i], 0)

      if (otherCurrentSum === 0) {
        const evenAmount = Math.round(remaining / 3)
        otherIndices.forEach((i, idx) => {
          newAmounts[i] = idx === otherIndices.length - 1
            ? Math.round(remaining - evenAmount * (otherIndices.length - 1))
            : evenAmount
        })
      } else {
        otherIndices.forEach(i => {
          const proportion = prev[i] / otherCurrentSum
          newAmounts[i] = Math.round(remaining * proportion)
        })
        const currentSum = newAmounts.reduce((s, v) => s + v, 0)
        const diff = Math.round(monthlyQuota) - currentSum
        if (diff !== 0) {
          const lastOther = otherIndices[otherIndices.length - 1]
          newAmounts[lastOther] = Math.max(0, newAmounts[lastOther] + diff)
        }
      }
      return newAmounts
    })
  }, [monthlyQuota])

  // ─── Linked accounts helpers ────────────────────────────────────────────────
  const addLinkedAccount = (accountId: string, subAccountId?: string | null) => {
    // Check if already linked
    const exists = linkedAccounts.some(
      la => la.accountId === accountId && la.subAccountId === (subAccountId || null)
    )
    if (exists) return

    const acc = accounts.find(a => a.id === accountId)
    if (!acc) return

    let label = ''
    let balance = 0

    if (subAccountId) {
      const sub = acc.subAccounts?.find(s => s.id === subAccountId)
      if (!sub) return
      label = `${acc.name} → ${sub.name}`
      balance = sub.balance
    } else {
      label = `${acc.name} (toda la cuenta)`
      balance = acc.balance
    }

    setLinkedAccounts(prev => [...prev, { accountId, subAccountId: subAccountId || null, label, balance }])
  }

  const removeLinkedAccount = (accountId: string, subAccountId?: string | null) => {
    setLinkedAccounts(prev => prev.filter(
      la => !(la.accountId === accountId && la.subAccountId === (subAccountId || null))
    ))
  }

  // ─── Validation ──────────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) newErrors.name = 'El nombre es obligatorio'
    if (targetNum <= 0) newErrors.targetAmount = 'El monto objetivo debe ser mayor a 0'
    if (!deadline) newErrors.deadline = 'La fecha límite es obligatoria'
    if (new Date(deadline) <= new Date()) newErrors.deadline = 'La fecha debe ser futura'

    if (frequency === 'quincenal' && biweeklyDay1 === biweeklyDay2) {
      newErrors.biweeklyDays = 'Los días quincenales deben ser diferentes'
    }

    if (frequency === 'quincenal') {
      const sum = biweeklyAmounts[0] + biweeklyAmounts[1]
      if (sum <= 0) newErrors.periodAmounts = 'Los montos quincenales deben sumar la cuota mensual'
    }

    if (frequency === 'semanal') {
      const sum = weeklyAmounts.reduce((s, v) => s + v, 0)
      if (sum <= 0) newErrors.periodAmounts = 'Los montos semanales deben sumar la cuota mensual'
    }

    if (!sourceAccountId) newErrors.sourceAccountId = 'Selecciona la cuenta origen'
    if (!destinationAccountId) newErrors.destinationAccountId = 'Selecciona la cuenta destino'
    if (sourceAccountId && destinationAccountId && sourceAccountId === destinationAccountId) {
      newErrors.destinationAccountId = 'La cuenta destino debe ser diferente a la origen'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [name, targetNum, deadline, frequency, biweeklyDay1, biweeklyDay2, biweeklyAmounts, weeklyAmounts, sourceAccountId, destinationAccountId])

  // ─── Load data on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      loadAccounts()
      loadCDTs()
    }
  }, [open])

  // ─── Populate from editing goal ──────────────────────────────────────────────
  useEffect(() => {
    if (open && editingGoal) {
      populateFromGoal(editingGoal)
    } else if (open && !editingGoal) {
      resetForm()
    }
  }, [open, editingGoal])

  const resetForm = () => {
    setName('')
    setTargetAmount('')
    setDeadline('')
    setFrequency('mensual')
    setMonthlyDay(1)
    setBiweeklyDay1(1)
    setBiweeklyDay2(15)
    setWeeklyDay(1)
    setBiweeklyAmounts([0, 0])
    setWeeklyAmounts([0, 0, 0, 0])
    setSourceAccountId('')
    setDestinationAccountId('')
    setSelectedCDTIds([])
    setLinkedAccounts([])
    setErrors({})
  }

  const loadAccounts = async () => {
    try {
      const data = await apiFetch<Account[]>('/api/accounts')
      setAccounts(data)
    } catch (e) {
      console.error('Error loading accounts:', e)
    }
  }

  const loadCDTs = async () => {
    try {
      const data = await apiFetch<CDT[]>('/api/cdts')
      setCDTs(data)
    } catch (e) {
      console.error('Error loading CDTs:', e)
    }
  }

  const populateFromGoal = (goal: any) => {
    setName(goal.name || '')
    setTargetAmount(goal.targetAmount?.toString() || '')
    setDeadline(goal.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '')
    setFrequency(goal.frequency || 'mensual')
    setMonthlyDay(goal.monthlyDay || 1)
    setSourceAccountId(goal.sourceAccountId || '')
    setDestinationAccountId(goal.destinationAccountId || '')

    if (goal.biweeklyDays) {
      try {
        const days = JSON.parse(goal.biweeklyDays)
        setBiweeklyDay1(days[0] || 1)
        setBiweeklyDay2(days[1] || 15)
      } catch {}
    }

    if (goal.weeklyDay !== undefined && goal.weeklyDay !== null) {
      setWeeklyDay(goal.weeklyDay)
    }

    if (goal.periodAmounts) {
      try {
        const amounts = JSON.parse(goal.periodAmounts)
        if (goal.frequency === 'quincenal' && amounts.length === 2) {
          setBiweeklyAmounts([amounts[0], amounts[1]])
        } else if (goal.frequency === 'semanal' && amounts.length === 4) {
          setWeeklyAmounts([amounts[0], amounts[1], amounts[2], amounts[3]])
        }
      } catch {}
    }

    if (goal.cdts) {
      setSelectedCDTIds(goal.cdts.map((cdt: any) => cdt.id))
    }

    // Populate linked accounts
    if (goal.linkedAccounts && goal.linkedAccounts.length > 0) {
      const items: LinkedAccountItem[] = goal.linkedAccounts.map((la: any) => ({
        accountId: la.accountId,
        subAccountId: la.subAccountId || null,
        label: la.subAccount
          ? `${la.account?.name || ''} → ${la.subAccount.name}`
          : `${la.account?.name || ''} (toda la cuenta)`,
        balance: la.subAccount ? la.subAccount.balance : (la.account?.balance || 0),
      }))
      setLinkedAccounts(items)
    } else {
      setLinkedAccounts([])
    }
  }

  // ─── Create CDT ─────────────────────────────────────────────────────────────
  const handleCreateCDT = async () => {
    const amount = parseFloat(newCDTAmount) || 0
    const rate = parseFloat(newCDTRate) || 0
    if (amount <= 0 || rate <= 0) return

    setLoading(true)
    try {
      const startDate = new Date()
      const endDate = new Date(Date.now() + newCDTTerm * 24 * 60 * 60 * 1000)
      const cdt = await apiFetch<CDT>('/api/cdts', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          bank: newCDTBank || 'Banco',
          effectiveRate: rate,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          termDays: newCDTTerm,
        }),
      })

      if (cdt) {
        setCDTs(prev => [...prev, cdt])
        if (cdt.id) setSelectedCDTIds(prev => [...prev, cdt.id])
        setNewCDTAmount('')
        setNewCDTRate('')
        setNewCDTBank('')
        setShowCDTDialog(false)
      }
    } catch (e) {
      console.error('Error creating CDT:', e)
    } finally {
      setLoading(false)
    }
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      const payload: any = {
        name,
        targetAmount: targetNum,
        deadline: new Date(deadline).toISOString(),
        frequency,
        sourceAccountId: sourceAccountId || undefined,
        destinationAccountId: destinationAccountId || undefined,
        monthlyDay: frequency === 'mensual' ? monthlyDay : undefined,
        biweeklyDays: frequency === 'quincenal' ? JSON.stringify([biweeklyDay1, biweeklyDay2]) : undefined,
        weeklyDay: frequency === 'semanal' ? weeklyDay : undefined,
        linkedCDTIds: selectedCDTIds,
        linkedAccountItems: linkedAccounts.map(la => ({
          accountId: la.accountId,
          subAccountId: la.subAccountId || undefined,
        })),
      }

      if (frequency === 'quincenal') {
        payload.periodAmounts = JSON.stringify(biweeklyAmounts)
      } else if (frequency === 'semanal') {
        payload.periodAmounts = JSON.stringify(weeklyAmounts)
      } else {
        payload.periodAmounts = JSON.stringify([Math.round(monthlyQuota)])
      }

      const url = editingGoal ? `/api/savings/${editingGoal.id}` : '/api/savings'
      const method = editingGoal ? 'PUT' : 'POST'

      const saved = await apiFetch<any>(url, {
        method,
        body: JSON.stringify(payload),
      })

      if (saved) {
        onSuccess?.(saved)
        onOpenChange(false)
      }
    } catch (e: any) {
      setErrors({ submit: e?.message || 'Error de conexión' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const biweeklySum = biweeklyAmounts[0] + biweeklyAmounts[1]
  const weeklySum = weeklyAmounts.reduce((s, v) => s + v, 0)
  const biweeklyDiff = Math.abs(biweeklySum - Math.round(monthlyQuota))
  const weeklyDiff = Math.abs(weeklySum - Math.round(monthlyQuota))

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-purple-600" />
            {editingGoal ? 'Editar Meta de Ahorro' : 'Nueva Meta de Ahorro'}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
            {/* ─── Nombre ─────────────────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Nombre de la meta</Label>
              <Input
                placeholder="Ej: Mi estudio, Vacaciones, Carro..."
                value={name}
                onChange={e => setName(e.target.value)}
                className={errors.name ? 'border-red-400' : ''}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* ─── Monto objetivo ──────────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Monto objetivo</Label>
              <CurrencyInput
                showPrefix
                placeholder="0"
                value={targetAmount}
                onChange={v => setTargetAmount(v)}
                className={errors.targetAmount ? 'border-red-400' : ''}
              />
              {errors.targetAmount && <p className="text-xs text-red-500">{errors.targetAmount}</p>}
            </div>

            {/* ─── Fecha límite ────────────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Fecha límite</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className={`pl-9 ${errors.deadline ? 'border-red-400' : ''}`}
                />
              </div>
              {errors.deadline && <p className="text-xs text-red-500">{errors.deadline}</p>}
            </div>

            {/* ─── CDTs vinculados ─────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Banknote className="h-4 w-4 text-amber-600" />
                  CDTs vinculados
                </Label>
                <Dialog open={showCDTDialog} onOpenChange={setShowCDTDialog}>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => setShowCDTDialog(true)}>
                    <Plus className="h-3 w-3" /> Nuevo CDT
                  </Button>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Crear CDT</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Monto del CDT</Label>
                        <CurrencyInput showPrefix placeholder="0" value={newCDTAmount}
                          onChange={v => setNewCDTAmount(v)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Plazo (días)</Label>
                        <Select value={newCDTTerm.toString()} onValueChange={v => setNewCDTTerm(parseInt(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 días</SelectItem>
                            <SelectItem value="60">60 días</SelectItem>
                            <SelectItem value="90">90 días</SelectItem>
                            <SelectItem value="180">180 días</SelectItem>
                            <SelectItem value="360">360 días</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tasa efectiva anual (%)</Label>
                        <Input type="number" step="0.01" placeholder="0" value={newCDTRate}
                          onChange={e => setNewCDTRate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Banco (opcional)</Label>
                        <Input placeholder="Nombre del banco" value={newCDTBank}
                          onChange={e => setNewCDTBank(e.target.value)} />
                      </div>
                      <Button onClick={handleCreateCDT} disabled={loading} className="w-full">
                        Crear y vincular a la meta
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {cdts.filter(c => c.status === 'active').length > 0 ? (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {cdts.filter(c => c.status === 'active').map(cdt => {
                    const isSelected = selectedCDTIds.includes(cdt.id)
                    return (
                      <div
                        key={cdt.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700' : 'hover:bg-muted'
                        }`}
                        onClick={() => {
                          setSelectedCDTIds(prev =>
                            isSelected ? prev.filter(id => id !== cdt.id) : [...prev, cdt.id]
                          )
                        }}
                      >
                        <Checkbox checked={isSelected} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{formatCurrency(cdt.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {cdt.termDays} días · {cdt.effectiveRate}% EA {cdt.bank ? `· ${cdt.bank}` : ''}
                          </p>
                        </div>
                        {isSelected && <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Vinculado</Badge>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No tienes CDTs activos. Crea uno nuevo.</p>
              )}

              {linkedCDTTotal > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300 p-2 rounded-lg">
                  <Banknote className="h-3.5 w-3.5" />
                  CDTs vinculados (valor invertido): <strong>{formatCurrency(linkedCDTTotal)}</strong>
                </div>
              )}
            </div>

            {/* ─── Cuentas vinculadas ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Link2 className="h-4 w-4 text-purple-600" />
                Cuentas vinculadas
              </Label>
              <p className="text-xs text-muted-foreground">
                Vincula cuentas o subcuentas para que su saldo cuente como aporte a la meta
              </p>

              {/* Add account selector */}
              <div className="flex gap-2">
                <Select onValueChange={(value) => {
                  if (value.startsWith('sub-')) {
                    const subId = value.replace('sub-', '')
                    const parentAcc = accounts.find(a => a.subAccounts?.some(s => s.id === subId))
                    if (parentAcc) addLinkedAccount(parentAcc.id, subId)
                  } else {
                    addLinkedAccount(value)
                  }
                }}>
                  <SelectTrigger className="flex-1 h-9 text-xs">
                    <SelectValue placeholder="Agregar cuenta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <div key={acc.id}>
                        <SelectItem value={acc.id} className="font-medium">
                          {acc.name} — {formatCurrency(acc.balance)}
                        </SelectItem>
                        {acc.subAccounts?.map(sub => (
                          <SelectItem key={sub.id} value={`sub-${sub.id}`} className="pl-8">
                            {sub.name} — {formatCurrency(sub.balance)}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Linked accounts list */}
              {linkedAccounts.length > 0 && (
                <div className="space-y-1.5">
                  {linkedAccounts.map((la, idx) => (
                    <div key={`${la.accountId}-${la.subAccountId}-${idx}`}
                      className="flex items-center justify-between p-2 rounded-lg border bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <Wallet className="h-4 w-4 text-purple-600 shrink-0" />
                        <span className="text-xs font-medium truncate">{la.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                          {formatCurrency(la.balance)}
                        </span>
                        <button
                          onClick={() => removeLinkedAccount(la.accountId, la.subAccountId || undefined)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {linkedAccountsTotal > 0 && (
                    <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-100 dark:bg-purple-900 dark:text-purple-300 p-2 rounded-lg">
                      <Wallet className="h-3.5 w-3.5" />
                      Saldo cuentas vinculadas: <strong>{formatCurrency(linkedAccountsTotal)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Resumen cuota mensual ────────────────────────────────────────── */}
            {monthlyQuota > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-semibold">Cuota mensual</span>
                </div>
                <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                  {formatCurrency(Math.round(monthlyQuota))}
                </p>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 space-y-0.5">
                  <p>Objetivo: {formatCurrency(targetNum)} · Plazo: {monthsRemaining} meses</p>
                  {totalAlreadyCovered > 0 && (
                    <p>Cubierto por CDTs + Cuentas: {formatCurrency(totalAlreadyCovered)} · Restante: {formatCurrency(remainingAmount)}</p>
                  )}
                </div>
              </div>
            )}

            {/* ─── Frecuencia ──────────────────────────────────────────────────── */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Frecuencia de aportes</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['mensual', 'quincenal', 'semanal'] as const).map(freq => (
                  <Button
                    key={freq}
                    variant={frequency === freq ? 'default' : 'outline'}
                    size="sm"
                    className={`text-xs ${frequency === freq ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                    onClick={() => setFrequency(freq)}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* ─── Mensual: selección de día ────────────────────────────────────── */}
            {frequency === 'mensual' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Día de pago mensual
                </Label>
                <Select value={monthlyDay.toString()} onValueChange={v => setMonthlyDay(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {DAYS_OF_MONTH.map(d => (
                      <SelectItem key={d} value={d.toString()}>Día {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cuota: <strong>{formatCurrency(Math.round(monthlyQuota))}</strong> el día {monthlyDay} de cada mes
                </p>
              </div>
            )}

            {/* ─── Quincenal: días y montos ─────────────────────────────────────── */}
            {frequency === 'quincenal' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Días de pago quincenal
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Primer día</Label>
                      <Select value={biweeklyDay1.toString()} onValueChange={v => setBiweeklyDay1(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-48">
                          {DAYS_OF_MONTH.map(d => (
                            <SelectItem key={d} value={d.toString()}>Día {d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Segundo día</Label>
                      <Select value={biweeklyDay2.toString()} onValueChange={v => setBiweeklyDay2(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-48">
                          {DAYS_OF_MONTH.map(d => (
                            <SelectItem key={d} value={d.toString()}>Día {d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {errors.biweeklyDays && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {errors.biweeklyDays}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Monto por fecha</Label>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xs">
                      Mensual: {formatCurrency(Math.round(monthlyQuota))}
                    </Badge>
                  </div>

                  {BIWEEKLY_LABELS.map((label, idx) => {
                    const day = idx === 0 ? biweeklyDay1 : biweeklyDay2
                    return (
                      <div key={idx} className="space-y-0.5">
                        <Label className="text-xs text-muted-foreground">
                          {label} (día {day})
                        </Label>
                        <CurrencyInput
                          showPrefix
                          placeholder="0"
                          value={biweeklyAmounts[idx] || ''}
                          onChange={v => handleBiweeklyAmountChange(idx as 0 | 1, v)}
                          className="h-9 text-sm"
                        />
                      </div>
                    )
                  })}

                  <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                    biweeklyDiff <= 1
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    <span>Suma: {formatCurrency(biweeklySum)}</span>
                    <span>
                      {biweeklyDiff <= 1
                        ? '✓ Cuadra con mensual'
                        : `Diferencia: ${formatCurrency(biweeklyDiff)}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Semanal: día y montos ────────────────────────────────────────── */}
            {frequency === 'semanal' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Día de pago semanal
                  </Label>
                  <Select value={weeklyDay.toString()} onValueChange={v => setWeeklyDay(parseInt(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map(d => (
                        <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Monto por semana</Label>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xs">
                      Mensual: {formatCurrency(Math.round(monthlyQuota))}
                    </Badge>
                  </div>

                  {WEEK_LABELS.map((label, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <CurrencyInput
                        showPrefix
                        placeholder="0"
                        value={weeklyAmounts[idx] || ''}
                        onChange={v => handleWeeklyAmountChange(idx, v)}
                        className="h-9 text-sm"
                      />
                    </div>
                  ))}

                  <div className={`flex items-center justify-between text-xs p-2 rounded-lg ${
                    weeklyDiff <= 1
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    <span>Suma: {formatCurrency(weeklySum)}</span>
                    <span>
                      {weeklyDiff <= 1
                        ? '✓ Cuadra con mensual'
                        : `Diferencia: ${formatCurrency(weeklyDiff)}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Cuentas origen y destino ───────────────────────────────────── */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                Cuentas de transferencia
              </Label>
              <p className="text-xs text-muted-foreground">
                El aporte se registrará como transferencia: sale de la cuenta origen y entra a la cuenta destino
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Origen (sale)</Label>
                  <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
                    <SelectTrigger className={errors.sourceAccountId ? 'border-red-400' : ''}>
                      <SelectValue placeholder="De dónde..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} — {formatCurrency(acc.balance)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.sourceAccountId && <p className="text-xs text-red-500">{errors.sourceAccountId}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Destino (entra)</Label>
                  <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                    <SelectTrigger className={errors.destinationAccountId ? 'border-red-400' : ''}>
                      <SelectValue placeholder="A dónde..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} — {formatCurrency(acc.balance)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.destinationAccountId && <p className="text-xs text-red-500">{errors.destinationAccountId}</p>}
                </div>
              </div>

              {sourceAccountId && destinationAccountId && sourceAccountId !== destinationAccountId && (
                <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 p-2 rounded-lg">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {accounts.find(a => a.id === sourceAccountId)?.name}
                  <span>→</span>
                  {accounts.find(a => a.id === destinationAccountId)?.name}
                  <span className="ml-auto font-medium">{formatCurrency(Math.round(monthlyQuota))}/mes</span>
                </div>
              )}
            </div>

            {/* ─── Resumen final ────────────────────────────────────────────────── */}
            {monthlyQuota > 0 && (
              <div className="border rounded-xl p-4 space-y-2 bg-muted/30">
                <p className="text-sm font-semibold">Resumen</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Meta:</span>
                  <span className="font-medium">{formatCurrency(targetNum)}</span>
                  <span className="text-muted-foreground">Plazo:</span>
                  <span className="font-medium">{monthsRemaining} meses</span>
                  <span className="text-muted-foreground">Frecuencia:</span>
                  <span className="font-medium capitalize">{frequency}</span>
                  <span className="text-muted-foreground">Cuota mensual:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(Math.round(monthlyQuota))}</span>
                  {frequency === 'quincenal' && (
                    <>
                      <span className="text-muted-foreground">Días de pago:</span>
                      <span className="font-medium">Día {biweeklyDay1} y día {biweeklyDay2}</span>
                      <span className="text-muted-foreground">Distribución:</span>
                      <span className="font-medium">
                        {formatCurrency(biweeklyAmounts[0])} + {formatCurrency(biweeklyAmounts[1])} = {formatCurrency(biweeklySum)}
                      </span>
                    </>
                  )}
                  {frequency === 'semanal' && (
                    <>
                      <span className="text-muted-foreground">Día de pago:</span>
                      <span className="font-medium">{DAYS_OF_WEEK.find(d => d.value === weeklyDay)?.label}</span>
                      <span className="text-muted-foreground">Distribución:</span>
                      <span className="font-medium">
                        {weeklyAmounts.map(a => formatCurrency(a)).join(' + ')} = {formatCurrency(weeklySum)}
                      </span>
                    </>
                  )}
                  {totalAlreadyCovered > 0 && (
                    <>
                      <span className="text-muted-foreground">CDTs + Cuentas:</span>
                      <span className="font-medium text-amber-600">{formatCurrency(totalAlreadyCovered)}</span>
                      <span className="text-muted-foreground">Restante por aportar:</span>
                      <span className="font-medium">{formatCurrency(remainingAmount)}</span>
                    </>
                  )}
                  {sourceAccountId && (
                    <>
                      <span className="text-muted-foreground">Origen:</span>
                      <span className="font-medium">{accounts.find(a => a.id === sourceAccountId)?.name}</span>
                    </>
                  )}
                  {destinationAccountId && (
                    <>
                      <span className="text-muted-foreground">Destino:</span>
                      <span className="font-medium">{accounts.find(a => a.id === destinationAccountId)?.name}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─── Error general ────────────────────────────────────────────────── */}
            {errors.submit && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                {errors.submit}
              </div>
            )}

          </DialogBody>

          <DialogStickyFooter>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <button
                onClick={handleSubmit}
                disabled={loading || (frequency === 'quincenal' && biweeklyDay1 === biweeklyDay2)}
                className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium text-white h-10 px-4 py-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)' }}
              >
                {loading ? 'Guardando...' : editingGoal ? 'Actualizar meta' : 'Crear meta'}
              </button>
            </div>
          </DialogStickyFooter>
        </DialogContent>
    </Dialog>
  )
}
