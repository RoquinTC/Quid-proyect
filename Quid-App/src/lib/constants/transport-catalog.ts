export const VEHICLE_BRANDS = [
  "Yamaha", "Honda", "Suzuki", "Kawasaki", "BMW", "Ducati", "KTM", "Triumph", 
  "Harley-Davidson", "Aprilia", "Royal Enfield", "Bajaj", "TVS", "Hero", "AKT", 
  "Toyota", "Chevrolet", "Ford", "Nissan", "Mazda", "Kia", "Hyundai", "Volkswagen", 
  "Renault", "Peugeot", "Audi", "Mercedes-Benz", "Volvo", "Tesla"
];

export const MAINTENANCE_CATEGORIES = [
  { id: "engine", name: "Motor y Aceite", icon: "settings" },
  { id: "brakes", name: "Frenos", icon: "disc" },
  { id: "tires", name: "Llantas y Ruedas", icon: "circle" },
  { id: "transmission", name: "Transmisión (Cadena/Banda)", icon: "link" },
  { id: "electrical", name: "Eléctrico y Batería", icon: "zap" },
  { id: "suspension", name: "Suspensión", icon: "sliders" },
  { id: "filters", name: "Filtros (Aire/Gasolina)", icon: "filter" },
  { id: "cleaning", name: "Lavado y Estética", icon: "sparkles" },
  { id: "other", name: "Otros", icon: "wrench" }
];

// Estándares genéricos para recordatorios automáticos basados en KM
export const STANDARD_MAINTENANCE_INTERVALS = {
  oil_change_motorcycle_mineral: { km: 3000, label: "Cambio de Aceite (Mineral)" },
  oil_change_motorcycle_synthetic: { km: 5000, label: "Cambio de Aceite (Sintético)" },
  oil_change_car: { km: 10000, label: "Cambio de Aceite Carro" },
  chain_lube: { km: 500, label: "Lubricación de Cadena" },
  chain_tension: { km: 1000, label: "Tensión de Cadena" },
  air_filter: { km: 12000, label: "Filtro de Aire" },
  spark_plug: { km: 10000, label: "Bujía(s)" },
  brakes_inspection: { km: 5000, label: "Inspección de Frenos" }
};
