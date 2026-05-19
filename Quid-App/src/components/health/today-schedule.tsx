"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, getColombiaTodayString } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Pill, Check } from "lucide-react";
import type { Medication } from "@/lib/types";

interface TodayScheduleProps {
  medications: Medication[];
}

interface ScheduleItem {
  time: string;
  hour: number;
  minute: number;
  medication: Medication;
  taken: boolean;
}

export function TodaySchedule({ medications }: TodayScheduleProps) {
  const [takenMeds, setTakenMeds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("takenMeds");
      if (stored) {
        const parsed = JSON.parse(stored) as { date: string; meds: string[] };
        const today = getColombiaTodayString();
        if (parsed.date === today) return new Set(parsed.meds);
      }
      return new Set();
    } catch {
      return new Set();
    }
  });

  const schedule: ScheduleItem[] = medications
    .filter((m) => m.reminderTimes)
    .flatMap((med) => {
      try {
        const times: string[] = JSON.parse(med.reminderTimes!);
        return times.map((time) => {
          const [h, m] = time.split(":").map(Number);
          return { time, hour: h, minute: m, medication: med, taken: takenMeds.has(`${med.id}-${time}`) };
        });
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const toggleTaken = (medId: string, time: string) => {
    const key = `${medId}-${time}`;
    setTakenMeds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Persist
      const today = getColombiaTodayString();
      localStorage.setItem("takenMeds", JSON.stringify({ date: today, meds: Array.from(next) }));
      return next;
    });
  };

  const takenCount = schedule.filter((s) => takenMeds.has(`${s.medication.id}-${s.time}`)).length;
  const totalDoses = schedule.length;

  if (schedule.length === 0) return null;

  return (
    <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-rose-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Hoy</span>
          </div>
          <Badge variant="secondary" className="text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {takenCount}/{totalDoses} tomados
          </Badge>
        </div>

        <div className="space-y-1.5">
          {schedule.map((item, idx) => {
            const isPast = item.hour * 60 + item.minute <= currentMinutes;
            const isTaken = takenMeds.has(`${item.medication.id}-${item.time}`);
            const isNext = !isTaken && isPast;

            const timeColor = item.hour >= 6 && item.hour < 12
              ? "text-amber-600 bg-amber-50 dark:bg-amber-900/20"
              : item.hour >= 12 && item.hour < 18
              ? "text-sky-600 bg-sky-50 dark:bg-sky-900/20"
              : "text-purple-600 bg-purple-50 dark:bg-purple-900/20";

            return (
              <button
                key={`${item.medication.id}-${item.time}-${idx}`}
                onClick={() => toggleTaken(item.medication.id, item.time)}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {/* Time */}
                <div className={`px-2 py-1 rounded-lg text-xs font-medium ${timeColor} min-w-[52px] text-center`}>
                  {item.time}
                </div>

                {/* Timeline dot */}
                <div className={`size-2.5 rounded-full shrink-0 ${
                  isTaken ? "bg-emerald-500" : isNext ? "bg-rose-500 animate-pulse" : "bg-gray-300"
                }`} />

                {/* Medication name */}
                <div className="flex-1 text-left">
                  <span className={`text-sm ${isTaken ? "line-through text-gray-400" : "text-gray-900 dark:text-white"}`}>
                    {item.medication.name}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-1.5">{item.medication.dosage}</span>
                </div>

                {/* Check */}
                <div className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
                  isTaken
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                }`}>
                  <Check className="size-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
