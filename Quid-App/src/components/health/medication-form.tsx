"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiFetch, toColombiaDateString } from "@/lib/api";
import { Loader2, Sparkles, Plus, X, Pill, AlertTriangle, AlertCircle, Info, Clock, RefreshCw, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Medication } from "@/lib/types";

const COMMON_MEDICATIONS = [
  "Acetaminofén",
  "Paracetamol",
  "Ibuprofeno",
  "Omeprazol",
  "Esomeprazol",
  "Pantoprazol",
  "Lansoprazol",
  "Ranitidina",
  "Metformina",
  "Levotiroxina",
  "Losartán",
  "Enalapril",
  "Atorvastatina",
  "Rosuvastatina",
  "Aspirina",
  "Loratadina",
  "Cetirizina",
  "Fexofenadina",
  "Salbutamol",
  "Montelukast",
  "Sertralina",
  "Fluoxetina",
  "Escitalopram",
  "Duloxetina",
  "Clonazepam",
  "Alprazolam",
  "Diazepam",
  "Lorazepam",
  "Pregabalina",
  "Gabapentina",
  "Quetiapina",
  "Amitriptilina",
  "Valproato de Sodio",
  "Carbamazepina",
  "Amlodipino",
  "Metoprolol",
  "Bisoprolol",
  "Carvedilol",
  "Espironolactona",
  "Furosemida",
  "Clopidogrel",
  "Warfarina",
  "Buscapina",
  "Trimebutina",
  "Bromuro de Pinaverio",
  "Domperidona",
  "Metoclopramida",
  "Diclofenaco",
  "Naproxeno",
  "Meloxicam",
  "Celecoxib",
  "Tramadol",
  "Hidrocodona",
  "Hydrocodone",
  "Deflazacort",
  "Prednisona",
  "Metotrexato",
  "Hidroxicloroquina",
  "Amoxicilina",
  "Azitromicina",
  "Ciprofloxacino",
  "Nitrofurantoína",
  "Cefalexina",
  "Tamoxifeno",
  "Pilocarpina"
];

const COMMON_DISEASES = [
  "Gastritis",
  "Reflujo gastroesofágico",
  "Úlcera gástrica / duodenal",
  "Hipertensión arterial",
  "Diabetes Mellitus Tipo 2",
  "Hipotiroidismo",
  "Hipertiroidismo",
  "Colesterol alto (Dislipidemia)",
  "Trastorno Depresivo Mayor",
  "Trastorno de Ansiedad Generalizada",
  "Trastorno de pánico",
  "Insomnio",
  "Epilepsia / Crisis convulsivas",
  "Migraña",
  "Dolor neuropático",
  "Dolor crónico",
  "Artritis reumatoide",
  "Lupus eritematoso sistémico",
  "Asma bronquial",
  "EPOC (Enfermedad Pulmonar Obstructiva)",
  "Rinitis alérgica",
  "Infección urinaria (Cistitis)",
  "Faringoamigdalitis",
  "Bronquitis aguda",
  "Fibromialgia",
  "Insuficiencia cardíaca",
  "Prevención de infartos / Trombosis"
];

const LOCAL_CLINICAL_DATABASE: Record<string, { diseases: string[]; recommendedDosage: string; howToTake: string }> = {
  "acetaminofen": {
    diseases: ["Dolor leve a moderado", "Fiebre"],
    recommendedDosage: "500mg - 1g cada 6 horas (máximo 4g al día)",
    howToTake: "with_food",
  },
  "paracetamol": {
    diseases: ["Dolor leve a moderado", "Fiebre"],
    recommendedDosage: "500mg - 1g cada 6 horas",
    howToTake: "with_food",
  },
  "ibuprofeno": {
    diseases: ["Inflamación", "Dolor articular", "Dolor menstrual", "Fiebre"],
    recommendedDosage: "400mg - 600mg cada 8 horas con alimentos",
    howToTake: "with_food",
  },
  "omeprazol": {
    diseases: ["Gastritis", "Reflujo gastroesofágico", "Úlcera gástrica"],
    recommendedDosage: "20mg una vez al día, preferiblemente 30 minutos antes del desayuno",
    howToTake: "without_food",
  },
  "esomeprazol": {
    diseases: ["Gastritis aguda", "Reflujo gastroesofágico", "Erradicación de H. Pylori"],
    recommendedDosage: "20mg o 40mg al día en ayunas",
    howToTake: "without_food",
  },
  "pantoprazol": {
    diseases: ["Gastritis", "Reflujo severo", "Úlcera gástrica"],
    recommendedDosage: "40mg una vez al día en ayunas",
    howToTake: "without_food",
  },
  "lansoprazol": {
    diseases: ["Gastritis", "Reflujo gastroesofágico", "Úlcera gástrica"],
    recommendedDosage: "30mg al día antes de comer",
    howToTake: "without_food",
  },
  "ranitidina": {
    diseases: ["Gastritis leve", "Acidez estomacal"],
    recommendedDosage: "150mg cada 12 horas",
    howToTake: "without_food",
  },
  "metformina": {
    diseases: ["Diabetes Mellitus Tipo 2", "Resistencia a la insulina"],
    recommendedDosage: "850mg - 1000mg con o inmediatamente después de las comidas principales",
    howToTake: "with_food",
  },
  "levotiroxina": {
    diseases: ["Hipotiroidismo"],
    recommendedDosage: "25mcg - 150mcg según indicación, 30 minutos antes del desayuno",
    howToTake: "without_food",
  },
  "losartán": {
    diseases: ["Hipertensión arterial", "Protección renal en diabetes"],
    recommendedDosage: "50mg una vez al día por la mañana",
    howToTake: "morning",
  },
  "enalapril": {
    diseases: ["Hipertensión arterial", "Insuficiencia cardíaca"],
    recommendedDosage: "10mg a 20mg al día",
    howToTake: "morning",
  },
  "atorvastatina": {
    diseases: ["Hipercolesterolemia (Colesterol alto)", "Prevención cardiovascular"],
    recommendedDosage: "10mg - 40mg una vez al día, preferiblemente por la noche",
    howToTake: "night",
  },
  "rosuvastatina": {
    diseases: ["Hipercolesterolemia (Colesterol alto)", "Prevención cardiovascular"],
    recommendedDosage: "10mg o 20mg una vez al día por la noche",
    howToTake: "night",
  },
  "aspirina": {
    diseases: ["Prevención de infartos (antiagregante)", "Dolor", "Fiebre"],
    recommendedDosage: "100mg al día (preventivo) o 500mg cada 8 horas (analgésico)",
    howToTake: "with_food",
  },
  "loratadina": {
    diseases: ["Alergias", "Rinitis alérgica", "Urticaria"],
    recommendedDosage: "10mg una vez al día",
    howToTake: "morning",
  },
  "cetirizina": {
    diseases: ["Rinitis alérgica", "Urticaria crónica", "Conjuntivitis alérgica"],
    recommendedDosage: "10mg una vez al día, preferiblemente por la noche",
    howToTake: "night",
  },
  "fexofenadina": {
    diseases: ["Rinitis alérgica", "Urticaria"],
    recommendedDosage: "120mg o 180mg una vez al día",
    howToTake: "morning",
  },
  "salbutamol": {
    diseases: ["Asma", "Broncoespasmo", "EPOC"],
    recommendedDosage: "1 a 2 inhalaciones (100mcg/puff) según necesidad",
    howToTake: "custom",
  },
  "montelukast": {
    diseases: ["Asma bronquial", "Prevención de broncoespasmo por ejercicio", "Rinitis"],
    recommendedDosage: "10mg una vez al día por la noche",
    howToTake: "night",
  },
  "sertralina": {
    diseases: ["Depresión", "Trastorno de pánico", "Ansiedad social"],
    recommendedDosage: "50mg una vez al día por la mañana o la noche",
    howToTake: "morning",
  },
  "fluoxetina": {
    diseases: ["Depresión", "Trastorno obsesivo compulsivo", "Bulimia"],
    recommendedDosage: "20mg una vez al día por la mañana",
    howToTake: "morning",
  },
  "escitalopram": {
    diseases: ["Depresión", "Trastorno de ansiedad generalizada", "Pánico"],
    recommendedDosage: "10mg o 20mg una vez al día",
    howToTake: "morning",
  },
  "duloxetina": {
    diseases: ["Depresión mayor", "Dolor neuropático periférico", "Ansiedad"],
    recommendedDosage: "60mg una vez al día por la mañana o la noche",
    howToTake: "morning",
  },
  "clonazepam": {
    diseases: ["Ansiedad severa", "Trastorno del sueño", "Crisis de pánico"],
    recommendedDosage: "0.25mg a 0.5mg antes de dormir",
    howToTake: "night",
  },
  "alprazolam": {
    diseases: ["Ansiedad generalizada", "Crisis de angustia / pánico"],
    recommendedDosage: "0.25mg a 0.5mg hasta tres veces al día",
    howToTake: "custom",
  },
  "diazepam": {
    diseases: ["Ansiedad", "Espasmo muscular", "Crisis convulsivas"],
    recommendedDosage: "2mg a 10mg dos a cuatro veces al día",
    howToTake: "custom",
  },
  "lorazepam": {
    diseases: ["Ansiedad", "Trastorno del sueño por ansiedad"],
    recommendedDosage: "1mg a 2mg antes de dormir o dividido en dos tomas",
    howToTake: "night",
  },
  "pregabalina": {
    diseases: ["Dolor neuropático", "Fibromialgia", "Ansiedad generalizada"],
    recommendedDosage: "75mg a 150mg dos veces al día",
    howToTake: "night",
  },
  "gabapentina": {
    diseases: ["Dolor neuropático", "Epilepsia (crisis parciales)"],
    recommendedDosage: "300mg a 900mg al día en dosis divididas",
    howToTake: "with_food",
  },
  "quetiapina": {
    diseases: ["Esquizofrenia", "Trastorno bipolar", "Insomnio refractario (dosis bajas)"],
    recommendedDosage: "25mg a 100mg antes de dormir para insomnio, o dosis mayores según indicación",
    howToTake: "night",
  },
  "amitriptilina": {
    diseases: ["Depresión", "Prevención de migraña", "Dolor neuropático"],
    recommendedDosage: "10mg a 25mg una vez al día por la noche",
    howToTake: "night",
  },
  "valproato de sodio": {
    diseases: ["Epilepsia", "Trastorno bipolar", "Prevención de migraña"],
    recommendedDosage: "15mg/kg al día en dosis divididas con comida",
    howToTake: "with_food",
  },
  "carbamazepina": {
    diseases: ["Epilepsia", "Neuralgia del trigémino", "Trastorno bipolar"],
    recommendedDosage: "100mg o 200mg una o dos veces al día",
    howToTake: "with_food",
  },
  "amlodipino": {
    diseases: ["Hipertensión arterial", "Angina de pecho"],
    recommendedDosage: "5mg o 10mg una vez al día",
    howToTake: "morning",
  },
  "metoprolol": {
    diseases: ["Hipertensión arterial", "Arritmias cardíacas", "Prevención post-infarto"],
    recommendedDosage: "50mg o 100mg una vez al día",
    howToTake: "with_food",
  },
  "bisoprolol": {
    diseases: ["Hipertensión arterial", "Cardiopatía isquémica", "Insuficiencia cardíaca"],
    recommendedDosage: "2.5mg a 10mg una vez al día",
    howToTake: "morning",
  },
  "carvedilol": {
    diseases: ["Insuficiencia cardíaca", "Hipertensión arterial"],
    recommendedDosage: "6.25mg a 25mg dos veces al día con alimentos",
    howToTake: "with_food",
  },
  "espironolactona": {
    diseases: ["Hipertensión arterial", "Insuficiencia cardíaca", "Edema"],
    recommendedDosage: "25mg a 100mg una vez al día con desayuno",
    howToTake: "morning",
  },
  "furosemida": {
    diseases: ["Edema (retención de líquidos)", "Hipertensión severa"],
    recommendedDosage: "20mg a 40mg una vez al día por la mañana",
    howToTake: "morning",
  },
  "clopidogrel": {
    diseases: ["Prevención cardiovascular (antiagregante plaquetario)"],
    recommendedDosage: "75mg una vez al día",
    howToTake: "morning",
  },
  "warfarina": {
    diseases: ["Trombosis venosa profunda", "Prevención de embolia en fibrilación auricular"],
    recommendedDosage: "2mg a 5mg al día según indicación médica y control de INR",
    howToTake: "custom",
  },
  "buscapina": {
    diseases: ["Espasmos estomacales", "Cólicos renales o biliares"],
    recommendedDosage: "10mg a 20mg según dolor, hasta 3 veces al día",
    howToTake: "with_food",
  },
  "trimebutina": {
    diseases: ["Síndrome de intestino irritable (Colon irritable)", "Espasmos"],
    recommendedDosage: "200mg dos o tres veces al día antes de comer",
    howToTake: "without_food",
  },
  "bromuro de pinaverio": {
    diseases: ["Colon irritable", "Espasmos intestinales", "Colitis"],
    recommendedDosage: "50mg o 100mg dos veces al día con un vaso de agua",
    howToTake: "with_food",
  },
  "domperidona": {
    diseases: ["Reflujo gastroesofágico", "Náuseas y vómitos", "Dispepsia"],
    recommendedDosage: "10mg hasta tres veces al día antes de las comidas",
    howToTake: "without_food",
  },
  "metoclopramida": {
    diseases: ["Náuseas", "Vómitos", "Gastroparesia diabética"],
    recommendedDosage: "10mg tres veces al día 30 minutos antes de las comidas",
    howToTake: "without_food",
  },
  "diclofenaco": {
    diseases: ["Dolor muscular", "Inflamación articular", "Artritis"],
    recommendedDosage: "50mg cada 8 a 12 horas con comida",
    howToTake: "with_food",
  },
  "naproxeno": {
    diseases: ["Dolor menstrual", "Inflamación osteomuscular", "Migraña"],
    recommendedDosage: "275mg o 550mg cada 12 horas con comida",
    howToTake: "with_food",
  },
  "meloxicam": {
    diseases: ["Artritis", "Artrosis", "Dolor inflamatorio"],
    recommendedDosage: "7.5mg o 15mg una vez al día con comida",
    howToTake: "with_food",
  },
  "celecoxib": {
    diseases: ["Artrosis", "Artritis reumatoide", "Dolor agudo"],
    recommendedDosage: "100mg o 200mg una o dos veces al día con alimentos",
    howToTake: "with_food",
  },
  "tramadol": {
    diseases: ["Dolor moderado a severo"],
    recommendedDosage: "50mg a 100mg según dolor (máximo 400mg al día)",
    howToTake: "with_food",
  },
  "hidrocodona": {
    diseases: ["Dolor moderado a severo", "Dolor agudo bajo control médico"],
    recommendedDosage: "Opioide de prescripción. Sigue exactamente la receta médica; no ajustes la dosis sin consultar a un profesional.",
    howToTake: "with_food",
  },
  "hydrocodone": {
    diseases: ["Dolor moderado a severo", "Dolor agudo bajo control médico"],
    recommendedDosage: "Opioide de prescripción. Sigue exactamente la receta médica; no ajustes la dosis sin consultar a un profesional.",
    howToTake: "with_food",
  },
  "deflazacort": {
    diseases: ["Inflamación severa", "Alergias graves", "Artritis"],
    recommendedDosage: "6mg a 30mg al día según indicación médica",
    howToTake: "morning",
  },
  "prednisona": {
    diseases: ["Inflamación", "Artritis reumatoide", "Alergias graves"],
    recommendedDosage: "5mg a 60mg al día con el desayuno",
    howToTake: "morning",
  },
  "metotrexato": {
    diseases: ["Artritis reumatoide severa", "Psoriasis grave"],
    recommendedDosage: "7.5mg a 25mg una sola vez a la semana",
    howToTake: "without_food",
  },
  "hidroxicloroquina": {
    diseases: ["Lupus eritematoso sistémico", "Artritis reumatoide"],
    recommendedDosage: "200mg o 400mg una vez al día con alimentos",
    howToTake: "with_food",
  },
  "amoxicilina": {
    diseases: ["Infecciones bacterianas respiratorias", "Otitis", "Infección urinaria"],
    recommendedDosage: "500mg cada 8 horas o 875mg cada 12 horas",
    howToTake: "with_food",
  },
  "azitromicina": {
    diseases: ["Infecciones respiratorias", "Infecciones de piel"],
    recommendedDosage: "500mg una vez al día durante 3 o 5 días",
    howToTake: "without_food",
  },
  "ciprofloxacino": {
    diseases: ["Infección urinaria complicada", "Gastroenteritis bacteriana"],
    recommendedDosage: "250mg o 500mg cada 12 horas",
    howToTake: "without_food",
  },
  "nitrofurantoína": {
    diseases: ["Infección urinaria (Cistitis agudas)"],
    recommendedDosage: "100mg cada 12 horas con comida durante 5 a 7 días",
    howToTake: "with_food",
  },
  "cefalexina": {
    diseases: ["Infecciones de piel y tejidos blandos", "Faringitis estreptocócica"],
    recommendedDosage: "250mg a 500mg cada 6 horas con alimentos",
    howToTake: "with_food",
  },
  "tamoxifeno": {
    diseases: ["Cáncer de mama (adyuvante / paliativo)"],
    recommendedDosage: "20mg al día",
    howToTake: "morning",
  },
  "pilocarpina": {
    diseases: ["Glaucoma de ángulo abierto", "Hipertensión ocular", "Xerostomía (boca seca)"],
    recommendedDosage: "1 gota en el ojo afectado cada 8-12 horas, o 5mg por vía oral cada 8 horas",
    howToTake: "custom",
  }
};

const frequencyOptions = [
  { value: "daily", label: "Diario" },
  { value: "twice_daily", label: "Dos veces al día" },
  { value: "three_times_daily", label: "Tres veces al día" },
  { value: "every_n_days", label: "Cada N días" },
  { value: "weekly", label: "Semanal" },
  { value: "as_needed", label: "Según necesidad" },
  { value: "custom", label: "Personalizado" },
];

const howToTakeOptions = [
  { value: "en_ayunas", label: "En ayunas (30-60 min antes de desayunar)" },
  { value: "before_meals", label: "Antes de las comidas" },
  { value: "with_food", label: "Con alimentos / durante la comida" },
  { value: "after_meals", label: "Después de las comidas" },
  { value: "with_first_bite", label: "Con el primer bocado de comida" },
  { value: "morning", label: "En la mañana" },
  { value: "afternoon", label: "En la tarde" },
  { value: "night", label: "En la noche / al acostarse" },
  { value: "as_needed", label: "Según necesidad / dolor" },
  { value: "custom", label: "Personalizado / Otra indicación" },
];

const translateHowToTake = (h: string): string => {
  if (!h) return "";
  const lower = h.toLowerCase().trim();
  if (lower === "en_ayunas") return "En ayunas (30-60 min antes de desayunar)";
  if (lower === "before_meals") return "Antes de las comidas";
  if (lower === "with_food") return "Con alimentos / durante la comida";
  if (lower === "after_meals") return "Después de las comidas";
  if (lower === "with_first_bite") return "Con el primer bocado de comida";
  if (lower === "morning") return "En la mañana";
  if (lower === "afternoon") return "En la tarde";
  if (lower === "night") return "En la noche / al acostarse";
  if (lower === "as_needed") return "Según necesidad / dolor";
  if (lower === "custom") return "Personalizado / Otra indicación";
  // Fallbacks for older entries
  if (lower === "without_food") return "En ayunas (Sin alimentos)";
  return h;
};

interface InteractionConflict {
  med1: string;
  med2: string;
  severity: "high" | "moderate";
  description: string;
  recommendation: string;
  suggestedHourOffset?: number;
}

const PHARMACOLOGICAL_INTERACTIONS: InteractionConflict[] = [
  {
    med1: "ibuprofeno",
    med2: "prednisona",
    severity: "high",
    description: "Riesgo elevado de sangrado gastrointestinal y úlceras severas al combinar AINEs con corticoides.",
    recommendation: "Se recomienda tomar el Ibuprofeno por la tarde/noche (con alimentos) y la Prednisona temprano en la mañana con un protector gástrico como Omeprazol.",
    suggestedHourOffset: 8
  },
  {
    med1: "ibuprofeno",
    med2: "prednisolona",
    severity: "high",
    description: "Riesgo de sangrado gastrointestinal y úlceras al combinar AINEs con corticoides.",
    recommendation: "Se recomienda tomar el Ibuprofeno por la tarde/noche (con alimentos) y la Prednisolona temprano en la mañana con un protector gástrico como Omeprazol.",
    suggestedHourOffset: 8
  },
  {
    med1: "ibuprofeno",
    med2: "deflazacort",
    severity: "high",
    description: "Riesgo elevado de sangrado gastrointestinal y úlceras al combinar AINEs con corticoides.",
    recommendation: "Se recomienda tomar el Ibuprofeno por la tarde/noche y el Deflazacort por la mañana.",
    suggestedHourOffset: 8
  },
  {
    med1: "aspirina",
    med2: "ibuprofeno",
    severity: "high",
    description: "El Ibuprofeno bloquea el efecto cardioprotector (antiagregante) de la Aspirina de baja dosis y aumenta el riesgo de sangrado.",
    recommendation: "Espaciar las tomas: tomar la Aspirina primero por la mañana y esperar al menos 2 horas antes de tomar el Ibuprofeno, o usar Paracetamol para el dolor.",
    suggestedHourOffset: 2
  },
  {
    med1: "aspirina",
    med2: "naproxeno",
    severity: "high",
    description: "Aumento severo del riesgo de úlceras gastrointestinales y sangrados.",
    recommendation: "Evitar la combinación si es posible. Si es necesario, espaciar las tomas por al menos 2 a 4 horas.",
    suggestedHourOffset: 4
  },
  {
    med1: "warfarina",
    med2: "aspirina",
    severity: "high",
    description: "Interacción de alto riesgo: peligro extremo de hemorragias graves.",
    recommendation: "No combine estos medicamentos sin supervisión médica estricta. Si requiere analgésico, prefiera Paracetamol.",
    suggestedHourOffset: 12
  },
  {
    med1: "warfarina",
    med2: "ibuprofeno",
    severity: "high",
    description: "Peligro extremo de hemorragia digestiva u otras hemorragias graves.",
    recommendation: "Evitar completamente la combinación. Utilizar Paracetamol en dosis bajas como analgésico alternativo.",
    suggestedHourOffset: 12
  },
  {
    med1: "levotiroxina",
    med2: "omeprazol",
    severity: "moderate",
    description: "El Omeprazol disminuye la acidez del estómago, reduciendo significativamente la absorción de la Levotiroxina.",
    recommendation: "Tomar la Levotiroxina en ayunas por la mañana (esperar 30-60 minutos antes de desayunar) y tomar el Omeprazol 30 minutos después.",
    suggestedHourOffset: 1
  },
  {
    med1: "levotiroxina",
    med2: "esomeprazol",
    severity: "moderate",
    description: "El Esomeprazol reduce la absorción de la hormona tiroidea Levotiroxina.",
    recommendation: "Tomar la Levotiroxina inmediatamente al despertar y el Esomeprazol al menos 30 a 60 minutos después.",
    suggestedHourOffset: 1
  },
  {
    med1: "levotiroxina",
    med2: "pantoprazol",
    severity: "moderate",
    description: "El Pantoprazol reduce la absorción de la hormona tiroidea Levotiroxina.",
    recommendation: "Tomar la Levotiroxina inmediatamente al despertar y el Pantoprazol al menos 30 a 60 minutos después.",
    suggestedHourOffset: 1
  },
  {
    med1: "sertralina",
    med2: "tramadol",
    severity: "high",
    description: "Riesgo de Síndrome Serotoninérgico (estado mental alterado, hipertermia, temblores, taquicardia).",
    recommendation: "No combine estos medicamentos ni los tome en el mismo horario sin supervisión médica directa.",
    suggestedHourOffset: 6
  },
  {
    med1: "fluoxetina",
    med2: "tramadol",
    severity: "high",
    description: "Riesgo severo de Síndrome Serotoninérgico.",
    recommendation: "No los tome a la misma hora. El espaciamiento es vital para evitar picos de serotonina en sangre.",
    suggestedHourOffset: 6
  },
  {
    med1: "escitalopram",
    med2: "tramadol",
    severity: "high",
    description: "Riesgo de Síndrome Serotoninérgico.",
    recommendation: "No los tome en el mismo horario. Es preferible espaciar las tomas por al menos 6 horas.",
    suggestedHourOffset: 6
  },
  {
    med1: "losartán",
    med2: "espironolactona",
    severity: "moderate",
    description: "Ambos medicamentos retienen potasio, pudiendo provocar Hiperpotasemia (potasio alto en sangre, peligroso para el corazón).",
    recommendation: "Requiere monitoreo frecuente de electrolitos por su médico. Intente no programar ambas dosis en la misma toma.",
    suggestedHourOffset: 4
  },
  {
    med1: "enalapril",
    med2: "espironolactona",
    severity: "moderate",
    description: "Riesgo de Hiperpotasemia severa al acumular potasio.",
    recommendation: "Monitorear potasio en sangre. Evitar tomar ambos al mismo tiempo.",
    suggestedHourOffset: 4
  },
  {
    med1: "atorvastatina",
    med2: "azitromicina",
    severity: "moderate",
    description: "Aumento del riesgo de toxicidad muscular (miopatía o rabdomiólisis).",
    recommendation: "Espaciar: tomar el antibiótico por la mañana y la Atorvastatina por la noche. Estar alerta a dolores musculares inexplicables.",
    suggestedHourOffset: 12
  }
];

interface MedicationInfo {
  diseases: string[];
  recommendedDosage: string;
  howToTake: string;
  sideEffects: string[];
}

interface MedicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication?: {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    customSchedule?: string | null;
    disease?: string | null;
    howToTake?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isActive: boolean;
    reminderEnabled: boolean;
    reminderTimes?: string | null;
    stockQuantity?: number | null;
    stockUnit?: string | null;
    doseQuantity?: number | null;
    lowStockThreshold?: number | null;
  } | null;
  onSuccess?: () => void;
}

const getInitialIntervalDays = (customSchedule?: string | null) => {
  if (!customSchedule) return "2";
  try {
    const parsed = JSON.parse(customSchedule) as { type?: string; everyDays?: number };
    if (parsed.type === "interval_days" && parsed.everyDays && parsed.everyDays >= 2) {
      return String(parsed.everyDays);
    }
  } catch {
    return "2";
  }
  return "2";
};

export function MedicationForm({ open, onOpenChange, medication, onSuccess }: MedicationFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(medication?.name || "");
  const [dosage, setDosage] = useState(medication?.dosage || "");
  const [frequency, setFrequency] = useState(medication?.frequency || "daily");
  const [intervalDays, setIntervalDays] = useState(getInitialIntervalDays(medication?.customSchedule));
  const [disease, setDisease] = useState(medication?.disease || "");
  const [howToTake, setHowToTake] = useState(medication?.howToTake || "");
  const [startDate, setStartDate] = useState(
    medication?.startDate ? toColombiaDateString(medication.startDate) : ""
  );
  const [endDate, setEndDate] = useState(
    medication?.endDate ? toColombiaDateString(medication.endDate) : ""
  );
  const [isActive, setIsActive] = useState(medication?.isActive ?? true);
  const [reminderEnabled, setReminderEnabled] = useState(medication?.reminderEnabled ?? true);
  const [stockQuantity, setStockQuantity] = useState(
    medication?.stockQuantity != null ? String(medication.stockQuantity) : ""
  );
  const [stockUnit, setStockUnit] = useState(medication?.stockUnit || "unit");
  const [doseQuantity, setDoseQuantity] = useState(
    medication?.doseQuantity != null ? String(medication.doseQuantity) : ""
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    medication?.lowStockThreshold != null ? String(medication.lowStockThreshold) : ""
  );
  const [reminderTimes, setReminderTimes] = useState<string[]>(() => {
    try {
      return medication?.reminderTimes ? JSON.parse(medication.reminderTimes) : [];
    } catch {
      return [];
    }
  });
  const [newTime, setNewTime] = useState("08:00");

  const applyPresetPeriod = (daysOrMonths: number | "infinite") => {
    if (daysOrMonths === "infinite") {
      setEndDate("");
      return;
    }
    const start = startDate ? new Date(startDate) : new Date();
    start.setMinutes(start.getMinutes() + start.getTimezoneOffset());
    
    if (daysOrMonths >= 30) {
      const months = Math.round(daysOrMonths / 30);
      start.setMonth(start.getMonth() + months);
    } else {
      start.setDate(start.getDate() + daysOrMonths);
    }
    
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");
    setEndDate(`${year}-${month}-${day}`);
  };

  // Autocomplete suggestions state
  const [medSuggestions, setMedSuggestions] = useState<string[]>([]);
  const [showMedDropdown, setShowMedDropdown] = useState(false);
  const [diseaseSuggestions, setDiseaseSuggestions] = useState<string[]>([]);
  const [showDiseaseDropdown, setShowDiseaseDropdown] = useState(false);

  const medDropdownRef = useRef<HTMLDivElement>(null);
  const diseaseDropdownRef = useRef<HTMLDivElement>(null);

  // Dismiss dropdowns on clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (medDropdownRef.current && !medDropdownRef.current.contains(e.target as Node)) {
        setShowMedDropdown(false);
      }
      if (diseaseDropdownRef.current && !diseaseDropdownRef.current.contains(e.target as Node)) {
        setShowDiseaseDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // AI suggestion state
  const [aiInfo, setAiInfo] = useState<MedicationInfo | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

  const isEditing = !!medication;

  const [otherMedications, setOtherMedications] = useState<Medication[]>([]);

  const isDuplicate = !isEditing && name.trim().length > 0 && otherMedications.some(
    (m) => m.name.toLowerCase().trim() === name.toLowerCase().trim()
  );

  useEffect(() => {
    if (open) {
      apiFetch<Medication[]>("/api/medications")
        .then((data) => {
          const filtered = medication
            ? data.filter((m) => m.id !== medication.id && m.isActive)
            : data.filter((m) => m.isActive);
          setOtherMedications(filtered);
        })
        .catch((err) => console.error("Error fetching other medications:", err));
    }
  }, [open, medication]);

  // Sincronizar estado del formulario cuando cambia open o el medicamento a editar
  useEffect(() => {
    if (open) {
      if (medication) {
        // Modo edición: cargar valores del medicamento
        setName(medication.name || "");
        setDosage(medication.dosage || "");
        setFrequency(medication.frequency || "daily");
        setIntervalDays(getInitialIntervalDays(medication.customSchedule));
        setDisease(medication.disease || "");
        setHowToTake(medication.howToTake || "");
        setStartDate(medication.startDate ? toColombiaDateString(medication.startDate) : "");
        setEndDate(medication.endDate ? toColombiaDateString(medication.endDate) : "");
        setIsActive(medication.isActive ?? true);
        setReminderEnabled(medication.reminderEnabled ?? true);
        setStockQuantity(medication.stockQuantity != null ? String(medication.stockQuantity) : "");
        setStockUnit(medication.stockUnit || "unit");
        setDoseQuantity(medication.doseQuantity != null ? String(medication.doseQuantity) : "");
        setLowStockThreshold(medication.lowStockThreshold != null ? String(medication.lowStockThreshold) : "");
        try {
          setReminderTimes(medication.reminderTimes ? JSON.parse(medication.reminderTimes) : []);
        } catch {
          setReminderTimes([]);
        }
      } else {
        // Modo creación: reiniciar el formulario limpio desde cero
        setName("");
        setDosage("");
        setFrequency("daily");
        setIntervalDays("2");
        setDisease("");
        setHowToTake("");
        setStartDate("");
        setEndDate("");
        setIsActive(true);
        setReminderEnabled(true);
        setStockQuantity("");
        setStockUnit("unit");
        setDoseQuantity("");
        setLowStockThreshold("");
        setReminderTimes([]);
      }
      setAiInfo(null);
      setShowAiSuggestions(false);
      setMedSuggestions([]);
      setShowMedDropdown(false);
      setShowDiseaseDropdown(false);
    }
  }, [open, medication]);

  const handleReprogram = (conflictingTime: string, suggestedTime: string) => {
    setReminderTimes((prev) => {
      const filtered = prev.filter((t) => t !== conflictingTime);
      if (!filtered.includes(suggestedTime)) {
        return [...filtered, suggestedTime].sort();
      }
      return filtered.sort();
    });
  };

  // Find conflicts dynamically
  const conflicts = (() => {
    if (!name || otherMedications.length === 0) return [];
    
    const currentNameClean = name.toLowerCase().trim();
    const foundConflicts: {
      type: "pharma" | "schedule";
      otherMedName: string;
      otherMedId: string;
      conflictingTime?: string;
      suggestedTime?: string;
      severity: "high" | "moderate" | "info";
      title: string;
      description: string;
      recommendation: string;
      suggestedOffset?: number;
    }[] = [];

    // 1. Check schedule conflicts (same hours)
    otherMedications.forEach((other) => {
      let otherTimes: string[] = [];
      try {
        if (other.reminderTimes) {
          otherTimes = typeof other.reminderTimes === "string" 
            ? JSON.parse(other.reminderTimes) 
            : other.reminderTimes;
        }
      } catch (e) {
        otherTimes = [];
      }

      // Check if they share any reminder time
      const commonTimes = reminderTimes.filter((t) => otherTimes.includes(t));
      commonTimes.forEach((time) => {
        foundConflicts.push({
          type: "schedule",
          otherMedName: other.name,
          otherMedId: other.id,
          conflictingTime: time,
          severity: "info",
          title: `Coincidencia de Horario`,
          description: `Ya tienes programado tomar "${other.name}" a las ${time}.`,
          recommendation: "Tomar múltiples pastillas a la misma hora puede causar molestias estomacales. Considera espaciar las tomas si es posible.",
        });
      });
    });

    // 2. Check pharmacological conflicts
    otherMedications.forEach((other) => {
      const otherNameClean = other.name.toLowerCase().trim();
      
      const rule = PHARMACOLOGICAL_INTERACTIONS.find((r) => {
        const matchForward = currentNameClean.includes(r.med1) && otherNameClean.includes(r.med2);
        const matchBackward = currentNameClean.includes(r.med2) && otherNameClean.includes(r.med1);
        return matchForward || matchBackward;
      });

      if (rule) {
        let otherTimes: string[] = [];
        try {
          if (other.reminderTimes) {
            otherTimes = typeof other.reminderTimes === "string" 
              ? JSON.parse(other.reminderTimes) 
              : other.reminderTimes;
          }
        } catch (e) {
          otherTimes = [];
        }

        const commonTimes = reminderTimes.filter((t) => otherTimes.includes(t));
        
        if (commonTimes.length > 0) {
          commonTimes.forEach((time) => {
            let suggestedTime = "14:00";
            const [h, m] = time.split(":").map(Number);
            if (!isNaN(h)) {
              const offset = rule.suggestedHourOffset || 4;
              const newHour = (h + offset) % 24;
              suggestedTime = `${String(newHour).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
            }

            foundConflicts.push({
              type: "pharma",
              otherMedName: other.name,
              otherMedId: other.id,
              conflictingTime: time,
              suggestedTime,
              severity: rule.severity,
              title: `⚠️ Interacción Peligrosa a las ${time}`,
              description: `Estás programando "${name}" a la misma hora que "${other.name}". ${rule.description}`,
              recommendation: rule.recommendation,
              suggestedOffset: rule.suggestedHourOffset,
            });
          });
        } else {
          foundConflicts.push({
            type: "pharma",
            otherMedName: other.name,
            otherMedId: other.id,
            severity: rule.severity === "high" ? "moderate" : "info",
            title: `⚠️ Advertencia de Interacción`,
            description: `Estás combinando "${name}" con "${other.name}" en tu tratamiento diario. ${rule.description}`,
            recommendation: rule.recommendation,
          });
        }
      }
    });

    return foundConflicts;
  })();

  const fetchAiInfo = useCallback(async (medName: string) => {
    if (!medName || medName.length < 3) {
      setAiInfo(null);
      setShowAiSuggestions(false);
      return;
    }
    setAiLoading(true);
    try {
      const data = await apiFetch<MedicationInfo>("/api/ai/medication-info", {
        method: "POST",
        body: JSON.stringify({ medicationName: medName }),
      });
      setAiInfo(data);
      setShowAiSuggestions(true);
    } catch {
      setAiInfo(null);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleSelectMedication = (medName: string) => {
    setName(medName);
    setShowMedDropdown(false);
    
    // Trigger AI loading
    fetchAiInfo(medName);

    // Instant local pre-fill
    const cleanKey = medName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const localMatch = LOCAL_CLINICAL_DATABASE[cleanKey];
    if (localMatch) {
      setDisease(localMatch.diseases.join(" / "));
      setDosage(localMatch.recommendedDosage);
      setHowToTake(localMatch.howToTake);
      setAiInfo({
        diseases: localMatch.diseases,
        recommendedDosage: localMatch.recommendedDosage,
        howToTake: localMatch.howToTake,
        sideEffects: [],
      });
      setShowAiSuggestions(true);
    }
  };

  const handleDiseaseChange = (value: string) => {
    setDisease(value);

    // Disease autocomplete predictions
    if (value.trim().length > 0) {
      const filtered = COMMON_DISEASES.filter((d) =>
        d.toLowerCase().includes(value.toLowerCase())
      );
      setDiseaseSuggestions(filtered);
      setShowDiseaseDropdown(true);
    } else {
      setDiseaseSuggestions([]);
      setShowDiseaseDropdown(false);
    }
  };

  const handleSelectDisease = (diseaseName: string) => {
    setDisease(diseaseName);
    setShowDiseaseDropdown(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setAiInfo(null);
    setShowAiSuggestions(false);
    
    // Autocomplete predictions
    if (value.trim().length > 0) {
      const filtered = COMMON_MEDICATIONS.filter((m) =>
        m.toLowerCase().includes(value.toLowerCase())
      );
      setMedSuggestions(filtered);
      setShowMedDropdown(true);
    } else {
      setMedSuggestions([]);
      setShowMedDropdown(false);
    }
  };

  const handleMedicationLookup = () => {
    const cleanName = name.trim();
    if (cleanName.length < 3 || aiLoading) return;
    setShowMedDropdown(false);
    fetchAiInfo(cleanName);
  };

  const addReminderTime = () => {
    if (newTime && !reminderTimes.includes(newTime)) {
      setReminderTimes([...reminderTimes, newTime].sort());
      setNewTime("08:00");
    }
  };

  const removeReminderTime = (time: string) => {
    setReminderTimes(reminderTimes.filter((t) => t !== time));
  };

  const applyAiDisease = (d: string) => {
    setDisease(d);
  };

  const applyAiHowToTake = (h: string) => {
    // Map AI text to our options
    const lower = h.toLowerCase();
    if (lower.includes("con alimentos") || lower.includes("con comida")) {
      setHowToTake("with_food");
    } else if (lower.includes("sin alimentos") || lower.includes("ayunas") || lower.includes("estómago vacío")) {
      setHowToTake("without_food");
    } else if (lower.includes("mañana")) {
      setHowToTake("morning");
    } else if (lower.includes("noche")) {
      setHowToTake("night");
    } else {
      setHowToTake(h);
    }
  };

  const handleSubmit = async () => {
    if (!name || isDuplicate) return;
    setLoading(true);
    try {
      const everyDays = Math.max(2, Math.floor(Number(intervalDays) || 2));
      const data = {
        name,
        dosage: dosage.trim(),
        frequency,
        customSchedule: frequency === "every_n_days"
          ? { type: "interval_days", everyDays }
          : null,
        disease: disease || null,
        howToTake: howToTake || null,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive,
        reminderEnabled,
        reminderTimes: reminderTimes.length > 0 ? reminderTimes : null,
        stockQuantity: stockQuantity ? Number(stockQuantity) : null,
        stockUnit: stockUnit || "unit",
        doseQuantity: doseQuantity ? Number(doseQuantity) : null,
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
      };

      if (isEditing && medication) {
        await apiFetch(`/api/medications/${medication.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/medications", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving medication:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!medication) {
      setName("");
      setDosage("");
      setFrequency("daily");
      setIntervalDays("2");
      setDisease("");
      setHowToTake("");
      setStartDate("");
      setEndDate("");
      setIsActive(true);
      setReminderEnabled(true);
      setStockQuantity("");
      setStockUnit("unit");
      setDoseQuantity("");
      setLowStockThreshold("");
      setReminderTimes([]);
    }
    setAiInfo(null);
    setShowAiSuggestions(false);
    setMedSuggestions([]);
    setShowMedDropdown(false);
    setDiseaseSuggestions([]);
    setShowDiseaseDropdown(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Medicamento" : "Nuevo Medicamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name with AI */}
          <div className="space-y-2" ref={medDropdownRef}>
            <Label htmlFor="med-name">Nombre del Medicamento</Label>
            <div className="relative">
              <Input
                id="med-name"
                placeholder="Ej: Omeprazol"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleMedicationLookup();
                  }
                }}
                className="rounded-xl pr-20"
              />
              {aiLoading && (
                <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 size-4 animate-spin text-rose-500" />
              )}
              {!aiLoading && aiInfo && (
                <Sparkles className="absolute right-12 top-1/2 -translate-y-1/2 size-4 text-rose-500" />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Consultar medicamento"
                aria-label="Consultar medicamento"
                onClick={handleMedicationLookup}
                disabled={aiLoading || name.trim().length < 3}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40"
              >
                <Search className="size-4" />
              </Button>
              {/* Autocomplete Dropdown */}
              {showMedDropdown && medSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {medSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSelectMedication(s)}
                      className="w-full text-left px-3.5 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors first:rounded-t-xl last:rounded-b-xl text-gray-700 dark:text-gray-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isDuplicate && (
              <div className="text-[11px] text-red-500 font-medium mt-1.5 flex items-center gap-1 animate-in fade-in duration-200">
                <AlertTriangle className="size-3 shrink-0" />
                <span>Este medicamento ya está registrado y activo en tu tratamiento.</span>
              </div>
            )}
          </div>

          {aiLoading && (
            <div className="p-3 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/10 dark:to-pink-900/10 border border-rose-100/50 dark:border-rose-900/20 rounded-xl flex items-center gap-2.5 animate-pulse">
              <Loader2 className="size-4 animate-spin text-rose-500 shrink-0" />
              <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">La IA de Quid está analizando el medicamento y recopilando recomendaciones...</span>
            </div>
          )}

          {/* Medication diagnosis */}
          {showAiSuggestions && aiInfo && !aiLoading && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 bg-rose-50 dark:bg-rose-950/20 rounded-xl space-y-3 border border-rose-200 dark:border-rose-800"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <Info className="size-3.5 text-rose-500" />
                  <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">Diagnóstico del medicamento</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchAiInfo(name)}
                  className="text-[10px] text-rose-600 hover:text-rose-700 h-6 px-1.5 flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-lg cursor-pointer"
                >
                  <RefreshCw className="size-2.5" />
                  <span>Volver a consultar</span>
                </Button>
              </div>

              {aiInfo.diseases.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Enfermedades que trata</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {aiInfo.diseases.map((d) => (
                      <Badge
                        key={d}
                        variant="secondary"
                        className="text-xs cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 bg-rose-50 text-rose-700 dark:text-rose-300 animate-in fade-in duration-200"
                        onClick={() => applyAiDisease(d)}
                      >
                        {d}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {aiInfo.recommendedDosage && (
                <div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Referencia de dosis</span>
                  <div className="flex items-start justify-between gap-2 mt-1">
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{aiInfo.recommendedDosage}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-5 px-1.5 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg font-medium cursor-pointer"
                      onClick={() => setDosage(aiInfo.recommendedDosage)}
                    >
                      <span>Aplicar</span>
                    </Button>
                  </div>
                </div>
              )}

              {aiInfo.howToTake && (
                <div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Recomendación de toma</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-xs h-auto p-0 text-rose-600 hover:text-rose-700 cursor-pointer"
                    onClick={() => applyAiHowToTake(aiInfo.howToTake)}
                  >
                    <Pill className="size-3 mr-1" />
                    Aplicar &quot;{translateHowToTake(aiInfo.howToTake)}&quot;
                  </Button>
                </div>
              )}

              <div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Efectos secundarios</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  {aiInfo.sideEffects.length > 0
                    ? aiInfo.sideEffects.join(", ")
                    : "No hay efectos secundarios sugeridos todavía para este medicamento."}
                </p>
              </div>
            </motion.div>
          )}

          {/* Dosage */}
          <div className="space-y-2">
            <Label htmlFor="med-dosage">Dosis o concentración <span className="text-gray-400 font-normal">(opcional)</span></Label>
            <Input
              id="med-dosage"
              placeholder="Ej: 20mg, 5ml, 1 tableta"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frecuencia</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {frequency === "every_n_days" && (
              <div className="grid grid-cols-[1fr_auto] items-end gap-2 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="med-interval-days" className="text-xs">Repetir cada</Label>
                  <Input
                    id="med-interval-days"
                    type="number"
                    min="2"
                    max="30"
                    step="1"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <span className="pb-2 text-xs text-gray-500">días</span>
                <p className="col-span-2 text-[11px] text-gray-500">
                  Ej: cada 2 días significa hoy sí, mañana no.
                </p>
              </div>
            )}
          </div>

          {/* Disease */}
          <div className="space-y-2" ref={diseaseDropdownRef}>
            <Label htmlFor="med-disease">Enfermedad</Label>
            <div className="relative">
              <Input
              id="med-disease"
              placeholder="Ej: Gastritis"
              value={disease}
              onChange={(e) => handleDiseaseChange(e.target.value)}
              autoComplete="off"
              className="rounded-xl"
            />

            {/* Autocomplete Dropdown */}
            {showDiseaseDropdown && diseaseSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {diseaseSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelectDisease(s)}
                    className="w-full text-left px-3.5 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors first:rounded-t-xl last:rounded-b-xl text-gray-700 dark:text-gray-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* How to take */}
          <div className="space-y-2">
            <Label>Cómo tomarlo</Label>
            <Select value={howToTake} onValueChange={setHowToTake}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {howToTakeOptions.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recordatorios (Horarios de Toma) */}
          <div className="space-y-3 p-3 bg-rose-50/30 dark:bg-rose-950/10 border border-rose-100/50 dark:border-rose-900/20 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Recordatorios y Horarios</Label>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Recibe alertas para tomar tu dosis
                </p>
              </div>
              <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
            </div>

            {reminderEnabled && (
              <div className="space-y-2 mt-2 pt-2 border-t border-rose-100/40 dark:border-rose-900/10">
                <Label className="text-xs text-gray-500">Programar Horas de Toma</Label>
                <div className="flex gap-2">
                  <Input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="rounded-xl flex-1 bg-white dark:bg-gray-800"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addReminderTime}
                    className="rounded-xl shrink-0"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                {reminderTimes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {reminderTimes.map((time) => (
                      <Badge
                        key={time}
                        variant="secondary"
                        className="text-xs gap-1 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-100 dark:border-rose-800/40"
                      >
                        {time}
                        <button type="button" onClick={() => removeReminderTime(time)} className="hover:text-rose-900 ml-1">
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Alertas de Conflictos y de Interacciones */}
          <AnimatePresence>
            {conflicts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2.5 overflow-hidden mt-1"
              >
                {conflicts.map((conflict, idx) => (
                  <motion.div
                    key={`${conflict.otherMedId}-${conflict.type}-${idx}`}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`p-3 rounded-xl border flex flex-col gap-1.5 shadow-sm text-xs transition-colors ${
                      conflict.severity === "high"
                        ? "bg-red-50/75 dark:bg-red-950/20 border-red-200 dark:border-red-900/30 text-red-900 dark:text-red-200"
                        : conflict.severity === "moderate"
                        ? "bg-amber-50/75 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-900 dark:text-amber-200"
                        : "bg-blue-50/75 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/20 text-blue-900 dark:text-blue-200"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {conflict.severity === "high" ? (
                        <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      ) : conflict.severity === "moderate" ? (
                        <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Info className="size-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                      )}
                      <div className="flex-1 space-y-0.5">
                        <span className="font-bold block text-sm tracking-tight">{conflict.title}</span>
                        <p className="leading-relaxed text-gray-700 dark:text-gray-300">{conflict.description}</p>
                      </div>
                    </div>

                    <div className="pl-6 border-t border-black/5 dark:border-white/5 pt-1.5 flex flex-col gap-1">
                      <span className="font-semibold block text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-wider">
                        Recomendación Médica:
                      </span>
                      <p className="leading-relaxed text-gray-600 dark:text-gray-400">{conflict.recommendation}</p>

                      {conflict.suggestedTime && conflict.conflictingTime && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleReprogram(conflict.conflictingTime!, conflict.suggestedTime!)}
                          className={`mt-1.5 self-start rounded-lg text-[11px] h-7 gap-1 border-current px-2.5 font-medium transition-all ${
                            conflict.severity === "high"
                              ? "text-red-700 hover:bg-red-100/50 dark:text-red-300 dark:hover:bg-red-900/30"
                              : conflict.severity === "moderate"
                              ? "text-amber-700 hover:bg-amber-100/50 dark:text-amber-300 dark:hover:bg-amber-900/30"
                              : "text-blue-700 hover:bg-blue-100/50 dark:text-blue-300 dark:hover:bg-blue-900/30"
                          }`}
                        >
                          <Clock className="size-3" />
                          Reprogramar a las {conflict.suggestedTime}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Date range */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="med-start">Fecha inicio</Label>
                <Input
                  id="med-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="med-end">Fecha fin (Opcional)</Label>
                <Input
                  id="med-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl"
                  placeholder="Indefinido"
                />
              </div>
            </div>
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 mt-1 items-center bg-gray-50/50 dark:bg-gray-800/30 p-2 rounded-xl border border-gray-100 dark:border-gray-800">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mr-1">Duración:</span>
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 cursor-pointer rounded-lg border-gray-200 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800 bg-white dark:bg-gray-850 text-gray-700 dark:text-gray-300"
                onClick={() => applyPresetPeriod('infinite')}
              >
                Continuo
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 cursor-pointer rounded-lg border-rose-100 hover:bg-rose-50 dark:border-rose-950/20 dark:hover:bg-rose-900/10 bg-white dark:bg-gray-850 text-rose-600 dark:text-rose-400"
                onClick={() => applyPresetPeriod(7)}
              >
                1 sem
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 cursor-pointer rounded-lg border-rose-100 hover:bg-rose-50 dark:border-rose-950/20 dark:hover:bg-rose-900/10 bg-white dark:bg-gray-850 text-rose-600 dark:text-rose-400"
                onClick={() => applyPresetPeriod(30)}
              >
                1 mes
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 cursor-pointer rounded-lg border-rose-100 hover:bg-rose-50 dark:border-rose-950/20 dark:hover:bg-rose-900/10 bg-white dark:bg-gray-850 text-rose-600 dark:text-rose-400"
                onClick={() => applyPresetPeriod(90)}
              >
                3 meses
              </Badge>
            </div>
          </div>

          {/* Inventory */}
          <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
            <div>
              <Label className="text-sm">Inventario</Label>
              <p className="text-xs text-gray-500">Opcional: ayuda a avisar cuando se está acabando.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="med-stock" className="text-xs">Cant. actual</Label>
                <Input
                  id="med-stock"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 30"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="rounded-xl px-2 text-xs h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="med-dose-qty" className="text-xs">Dosis toma</Label>
                <Input
                  id="med-dose-qty"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 1"
                  value={doseQuantity}
                  onChange={(e) => setDoseQuantity(e.target.value)}
                  className="rounded-xl px-2 text-xs h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="med-low-stock" className="text-xs">Alerta en</Label>
                <Input
                  id="med-low-stock"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej: 5"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="rounded-xl px-2 text-xs h-9"
                />
              </div>
            </div>
          </div>

          {/* Active switch */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Medicamento activo</Label>
              <p className="text-xs text-gray-400">
                Desactiva si ya no lo tomas
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name || isDuplicate}
            className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-700 hover:to-pink-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Agregar Medicamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
