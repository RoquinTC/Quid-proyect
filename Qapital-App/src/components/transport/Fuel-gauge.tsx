"use client";

import { motion } from "framer-motion";
import { Bike, Car } from "lucide-react";

interface FuelGaugeProps {
  fuelLevel: number; // 0-100 percentage
  vehicleType: string;
  tankCapacity?: number | null;
  currentFuel?: number; // in gallons
  showDetails?: boolean;
}

export function FuelGauge({ 
  fuelLevel, 
  vehicleType, 
  tankCapacity, 
  currentFuel,
  showDetails = true 
}: FuelGaugeProps) {
  const isMotorcycle = vehicleType === "motorcycle";
  const normalizedLevel = Math.max(0, Math.min(100, fuelLevel));
  
  // Color based on level
  const getFuelColor = (level: number) => {
    if (level > 75) return "#10B981"; // emerald-500
    if (level > 50) return "#3B82F6"; // blue-500
    if (level > 25) return "#F59E0B"; // amber-500
    return "#EF4444"; // red-500
  };

  const fuelColor = getFuelColor(normalizedLevel);

  // Animation variants for liquid
  const liquidVariants = {
    initial: { height: '0%' },
    animate: {
      height: `${normalizedLevel}%`,
      y: [0, -2, 0],
      transition: {
        height: { duration: 1.5, ease: "easeInOut" as const },
        y: { duration: 2, repeat: Infinity, ease: "easeInOut" as const }
      }
    }
  };

  // Bubble animation for low fuel
  const bubbleVariants = {
    animate: (i: number) => ({
      y: [-10, -40],
      opacity: [0, 1, 0],
      transition: {
        duration: 1.5,
        delay: i * 0.3,
        repeat: Infinity,
        ease: "easeOut" as const
      }
    })
  };

  return (
    <div className="relative w-full">
      {/* Main Gauge Container */}
      <div className="relative mx-auto" style={{ maxWidth: isMotorcycle ? '120px' : '180px' }}>
        
        {/* Vehicle Icon Background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          {isMotorcycle ? (
            <Bike className="w-16 h-16 text-gray-400" />
          ) : (
            <Car className="w-20 h-20 text-gray-400" />
          )}
        </div>

        {/* Tank Container - Gas Pump Style */}
        <div className="relative bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-3xl p-1 shadow-lg border-2 border-gray-300 dark:border-gray-600">
          
          {/* Tank Display Window */}
          <div className="relative bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-2xl overflow-hidden border-2 border-gray-400 dark:border-gray-500">
            
            {/* Tank Cavity */}
            <div 
              className="relative w-full"
              style={{ 
                height: isMotorcycle ? '100px' : '140px',
                borderRadius: '12px'
              }}
            >
              {/* Empty Tank Background */}
              <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900" />
              
              {/* Fuel Level - Liquid Effect */}
              <motion.div
                className="absolute bottom-0 left-0 right-0"
                variants={liquidVariants}
                initial="initial"
                animate="animate"
                style={{
                  background: `linear-gradient(180deg, ${fuelColor}dd 0%, ${fuelColor} 100%)`,
                  borderRadius: '0 0 12px 12px'
                }}
              >
                {/* Wave Effect on Top */}
                <div className="absolute -top-2 left-0 right-0 h-4 overflow-hidden">
                  <motion.div
                    className="absolute w-[200%] h-full"
                    style={{
                      background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120'%3E%3Cpath fill='${fuelColor.replace('#', '%23')}' d='M0,60 C300,120 600,0 900,60 C1200,120 1500,0 1800,60 L1800,120 L0,120 Z'/%3E%3C/svg%3E")`,
                      backgroundSize: '50% 100%',
                      backgroundRepeat: 'repeat-x'
                    }}
                    animate={{ x: ['-50%', '0%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  />
                </div>

                {/* Bubbles when fuel is low */}
                {normalizedLevel < 25 && (
                  <>
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute w-2 h-2 rounded-full bg-white/40"
                        style={{
                          left: `${20 + i * 30}%`,
                          bottom: `${10 + i * 15}%`
                        }}
                        custom={i}
                        variants={bubbleVariants}
                        animate="animate"
                      />
                    ))}
                  </>
                )}

                {/* Fuel Level Indicator Lines */}
                <div className="absolute inset-0 pointer-events-none">
                  {[25, 50, 75].map((mark) => (
                    <div
                      key={mark}
                      className="absolute left-0 right-0 border-t border-dashed border-white/30"
                      style={{ bottom: `${mark}%` }}
                    />
                  ))}
                </div>
              </motion.div>

              {/* Percentage Display */}
              {showDetails && (
                <motion.div 
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                    <span className="text-2xl font-bold text-white">
                      {Math.round(normalizedLevel)}%
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Capacity Info */}
              {showDetails && tankCapacity && currentFuel !== undefined && (
                <motion.div 
                  className="absolute bottom-2 left-0 right-0 flex justify-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <div className="bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
                    <span className="text-xs text-white font-medium">
                      {currentFuel.toFixed(2)} / {tankCapacity} gal
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Tank Cap Decorative */}
          <div className="absolute -right-3 top-8 w-4 h-4 bg-gray-400 dark:bg-gray-600 rounded-full border-2 border-gray-500 dark:border-gray-700" />
        </div>

        {/* Status Indicators Below Tank */}
        <div className="mt-3 flex justify-center gap-1">
          {[...Array(4)].map((_, i) => {
            const threshold = (i + 1) * 25;
            const isActive = normalizedLevel >= threshold;
            return (
              <motion.div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  isActive 
                    ? i === 3 && normalizedLevel > 75 ? 'bg-emerald-500' 
                    : i === 2 && normalizedLevel > 50 ? 'bg-blue-500'
                    : i === 1 && normalizedLevel > 25 ? 'bg-amber-500'
                    : 'bg-red-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                initial={{ scale: 0 }}
                animate={{ scale: isActive ? 1 : 0.8 }}
                transition={{ delay: i * 0.1 }}
              />
            );
          })}
        </div>

        {/* Low Fuel Warning */}
        {normalizedLevel < 15 && (
          <motion.div
            className="mt-2 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                ⚠️ Combustible Bajo
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}