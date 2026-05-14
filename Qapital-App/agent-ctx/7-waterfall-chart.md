# Feature #7: Gráfico de Cascada (Waterfall Chart)

## Task Summary
Implemented a waterfall chart component showing: Saldo inicial → +Ingresos → -Gastos fijos → -Gastos variables → = Saldo final

## Files Created
- `src/components/finance/waterfall-chart.tsx` — New waterfall chart component using Recharts BarChart with stacked bars

## Files Modified
- `src/components/finance/finance-overview.tsx` — Added waterfall widget integration
- `src/components/finance/accounts-view.tsx` — Added waterfall widget integration + fixed pre-existing syntax bug

## Implementation Details

### WaterfallChart Component
- **Props**: `initialBalance`, `income`, `fixedExpenses`, `variableExpenses`
- **Data structure**: 5 bars using stacked Bar approach (invisible base + visible value)
  - "Saldo Inicial" — blue `#3B82F6` — starting balance (full bar from 0)
  - "+ Ingresos" — green `#10B981` — income bar rising from previous total
  - "- Gastos Fijos" — rose `#F43F5E` — fixed expenses bar dropping down
  - "- Gastos Variables" — amber `#F59E0B` — variable expenses bar dropping down
  - "= Saldo Final" — purple `#8B5CF6` (positive) or red `#EF4444` (negative) — result bar from 0
- **Stacked approach**: Uses `stackId="waterfall"` with transparent base bar and colored value bar
- **Visual**: Rounded bar corners, custom tooltip, legend, summary pill, responsive ~200px height
- **All text in Spanish**

### Finance-Overview Integration
- Added "waterfall" to `DEFAULT_WIDGETS` at order 1 (after balance)
- Computed `fixedExpenses` from budgets with categories: "Vivienda", "Servicios", "Suscripciones", "Deudas"
- Computed `variableExpenses` from all other expense budget categories
- Computed `waterfallInitialBalance` from `monthlySummary.historical` (previous month's balance)
- Added waterfall case in widget switch with `BarChart3` icon

### Accounts-View Integration
- Added "waterfall" to `WidgetId` type union
- Added to `WIDGET_ICONS` map with `BarChart3` icon
- Added to `DEFAULT_WIDGET_ORDER` at order 2
- Added same computed values (fixedExpenses, variableExpenses, waterfallInitialBalance)
- Added waterfall case in `renderWidgetContent` switch
- Fixed pre-existing syntax bug: template literal closing order `"bg-emerald-300"`}` → `"bg-emerald-300"}``

## Lint Status
- All 3 files (waterfall-chart.tsx, finance-overview.tsx, accounts-view.tsx) pass ESLint with zero errors
- Pre-existing errors in other files remain unchanged (installment-plan.tsx, currency-input.tsx, etc.)
