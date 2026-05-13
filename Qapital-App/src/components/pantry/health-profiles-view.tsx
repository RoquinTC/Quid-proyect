"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { HealthProfileForm } from "./health-profile-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ShieldCheck,
  User,
  Users,
  Sparkles,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import type { HealthProfile } from "@/lib/types";

interface FoodRestriction {
  food: string;
  reason: string;
  level: string;
  relatedDisease: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function HealthProfilesView() {
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HealthProfile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const data = await apiFetch<HealthProfile[]>("/api/health-profiles");
      setProfiles(data);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/health-profiles/${id}`, { method: "DELETE" });
      await fetchProfiles();
    } catch (error) {
      console.error("Error deleting profile:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (profile: HealthProfile) => {
    setEditingProfile(profile);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingProfile(null);
  };

  const parseJSON = (str: string | null): FoodRestriction[] | string[] => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  const ownerProfiles = profiles.filter((p) => p.type === "owner");
  const guestProfiles = profiles.filter((p) => p.type === "guest");

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-amber-600 to-orange-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="size-4 text-amber-200" />
              <span className="text-sm text-amber-100">Perfiles de Salud</span>
            </div>
            <p className="text-lg font-bold">Gestión alimentaria</p>
            <p className="text-xs text-amber-200 mt-1">
              Define restricciones para comprar y cocinar mejor
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Empty State */}
      {profiles.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-4">
                <ShieldCheck className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin perfiles de salud
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Crea tu perfil para recibir recomendaciones personalizadas y restricciones alimentarias
              </p>
              <Button
                onClick={() => setShowForm(true)}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
              >
                <Plus className="size-4 mr-1" />
                Crear Perfil
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Owner Profiles */}
          {ownerProfiles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="size-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Mi Perfil
                </h3>
              </div>
              {ownerProfiles.map((profile) => {
                const diseases = parseJSON(profile.diseases) as string[];
                const restrictions = parseJSON(profile.restrictions) as FoodRestriction[];
                const aiRestrictions = parseJSON(profile.aiRestrictions) as FoodRestriction[];
                const allRestrictions = [...restrictions, ...aiRestrictions];

                return (
                  <motion.div key={profile.id} variants={itemVariants}>
                    <Card className="border-0 shadow-sm rounded-2xl bg-white dark:bg-gray-800">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {profile.name}
                            </h3>
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Propietario
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(profile)}
                              className="size-7 rounded-md flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            >
                              <Sparkles className="size-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(profile.id)}
                              disabled={deletingId === profile.id}
                              className="size-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              {deletingId === profile.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Diseases */}
                        {diseases.length > 0 && (
                          <div className="mb-2">
                            <span className="text-[10px] text-gray-400">Condiciones:</span>
                            <div className="flex gap-1 flex-wrap mt-1">
                              {diseases.map((d: string) => (
                                <Badge key={d} variant="outline" className="text-[10px] h-5">
                                  {d}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Restrictions */}
                        {allRestrictions.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <span className="text-[10px] text-gray-400">Restricciones:</span>
                            {allRestrictions.slice(0, 5).map((r: FoodRestriction | string, idx: number) => {
                              const restriction = typeof r === "string" ? { food: r, reason: "", level: "", relatedDisease: "" } : r;
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/10"
                                >
                                  <AlertCircle className="size-3 text-red-400 shrink-0" />
                                  <span className="text-xs text-red-700 dark:text-red-400">
                                    {restriction.food}
                                  </span>
                                  {restriction.reason && (
                                    <span className="text-[10px] text-red-500 truncate">
                                      — {restriction.reason}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                            {allRestrictions.length > 5 && (
                              <span className="text-[10px] text-gray-400">
                                +{allRestrictions.length - 5} más
                              </span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Guest Profiles */}
          {guestProfiles.length > 0 && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-500">Invitados</h3>
              </div>
              {guestProfiles.map((profile) => {
                const restrictions = parseJSON(profile.restrictions) as FoodRestriction[];
                const aiRestrictions = parseJSON(profile.aiRestrictions) as FoodRestriction[];
                const allRestrictions = [...restrictions, ...aiRestrictions];

                return (
                  <motion.div key={profile.id} variants={itemVariants}>
                    <Card className="border-0 shadow-sm rounded-2xl bg-white/70 dark:bg-gray-800/70">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                              {profile.name}
                            </h3>
                            <Badge className="text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                              Invitado
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(profile)}
                              className="size-7 rounded-md flex items-center justify-center text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            >
                              <Sparkles className="size-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(profile.id)}
                              className="size-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {allRestrictions.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {allRestrictions.slice(0, 4).map((r: FoodRestriction | string, idx: number) => {
                              const food = typeof r === "string" ? r : r.food;
                              return (
                                <Badge key={idx} variant="outline" className="text-[10px] h-5 text-red-600 border-red-200">
                                  {food}
                                </Badge>
                              );
                            })}
                            {allRestrictions.length > 4 && (
                              <Badge variant="outline" className="text-[10px] h-5 text-gray-400">
                                +{allRestrictions.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* FAB - Add Profile */}
      {profiles.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => setShowForm(true)}
            className="size-14 rounded-full bg-gradient-to-br from-amber-600 to-orange-500 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Form */}
      <HealthProfileForm
        open={showForm}
        onOpenChange={handleCloseForm}
        profile={editingProfile}
        onSuccess={fetchProfiles}
      />
    </motion.div>
  );
}
