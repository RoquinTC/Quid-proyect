import { describe, it, expect } from "vitest";
import { classifyCapture, isMovement } from "@/lib/inbox/classify";

/**
 * Estos casos son variantes de SMS que llegaron de verdad al teléfono.
 * Se cambian montos y nombres, no la estructura.
 */
describe("ruido: claves y códigos", () => {
  it("una clave temporal no es un movimiento (aunque mencione el retiro)", () => {
    const r = classifyCapture(
      "Su clave temporal para realizar el retiro sin tarjeta del Banco en cajero automatico es 483920"
    );
    expect(r.kind).toBe("noise");
    expect(r.noiseReason).toBe("otp");
    expect(isMovement(r)).toBe(false);
  });

  it("reconoce un código de verificación", () => {
    expect(classifyCapture("Tu codigo de verificacion es 771204").noiseReason).toBe("otp");
  });

  it("reconoce 'no la compartas'", () => {
    expect(classifyCapture("Clave dinamica 9912. No la compartas con nadie").noiseReason).toBe("otp");
  });
});

describe("ruido: publicidad y estafa", () => {
  it("no registra una oferta de plan celular", () => {
    const r = classifyCapture(
      "Buscando celu? En Full Equipo tienes plan celular ilimitado por $89.900 + un Moto G47"
    );
    expect(r.kind).toBe("noise");
    expect(r.noiseReason).toBe("promo");
  });

  it("no registra cashback promocional", () => {
    const r = classifyCapture(
      "Que tu tarjeta te devuelva plata! Recibe $150.000 cashback por comprar"
    );
    expect(r.kind).toBe("noise");
  });

  it("no registra un recordatorio de factura con enlace", () => {
    const r = classifyCapture("Consulta y paga tu factura aqui: https://smsce.co/s/abc123");
    expect(r.kind).toBe("noise");
  });

  it("no registra una estafa que exige pago", () => {
    const r = classifyCapture(
      "URGENTE: has sido seleccionado, debes pagar $5.000 para reclamar tu premio"
    );
    expect(r.kind).toBe("noise");
    expect(r.noiseReason).toBe("scam");
  });
});

describe("retiro en cajero = plata que cambia de sitio", () => {
  it("lo clasifica como transferencia con marca de efectivo", () => {
    const r = classifyCapture(
      "Su retiro sin tarjeta en Caj. Automat de ATH fue aprobado el 2026-10-17 por valor $120.000"
    );
    expect(r.kind).toBe("transfer");
    expect(r.cashWithdrawal).toBe(true);
    expect(isMovement(r)).toBe(true);
  });

  it("también con la palabra cajero completa", () => {
    const r = classifyCapture("Retiraste $200.000 en CAJERO AUTOMATICO BANCOLOMBIA");
    expect(r.kind).toBe("transfer");
    expect(r.cashWithdrawal).toBe(true);
  });
});

describe("ingresos", () => {
  it("reconoce 'has recibido una transferencia'", () => {
    const r = classifyCapture(
      "BoldCF: Has recibido una transferencia a traves de llaves por valor de $50,000.00 a tu cuenta"
    );
    expect(r.kind).toBe("income");
  });

  it("reconoce 'recibiste'", () => {
    expect(classifyCapture("Recibiste una transferencia por $200.000 de JUAN").kind).toBe("income");
  });

  it("reconoce un abono", () => {
    expect(classifyCapture("Se realizo un abono a tu cuenta por $80.000").kind).toBe("income");
  });
});

describe("transferencias entre cuentas propias", () => {
  it("detecta el movimiento entre dos cuentas", () => {
    const r = classifyCapture(
      "Transferencia por Banca Movil $15,000.00 de Cta Aho #3601 de BBOGOTA a Cta Aho #190 de BBOGOTA"
    );
    expect(r.kind).toBe("transfer");
    expect(r.cashWithdrawal).toBeFalsy();
  });
});

describe("gastos", () => {
  it("reconoce 'pagaste'", () => {
    expect(classifyCapture("Uala: Pagaste $3000 a Claro").kind).toBe("expense");
  });

  it("reconoce una compra en comercio", () => {
    expect(classifyCapture("Compraste $45.900 en EXITO PRADO con tu T.Debito").kind).toBe("expense");
  });

  it("reconoce una recarga de celular", () => {
    expect(classifyCapture("Recargaste $3000 vig 60 dias").kind).toBe("expense");
  });

  it("reconoce el cobro de un seguro", () => {
    expect(
      classifyCapture("Bancolombia: Listo. hoy 21/10/2026 su SEGURO CARDIF por $289.900 ha sido Activado")
        .kind
    ).toBe("expense");
  });

  it("reconoce una factura de servicios", () => {
    expect(
      classifyCapture("Generamos tu factura de Octubre, linea 6054210572 valor $167,489")
        .kind
    ).toBe("expense");
  });
});

describe("casos límite", () => {
  it("un mensaje sin señales se conserva como gasto para revisar", () => {
    const r = classifyCapture("Movimiento por $12.000");
    expect(r.kind).toBe("expense");
    expect(isMovement(r)).toBe(true);
  });

  it("no lanza con entradas raras", () => {
    expect(() => classifyCapture("")).not.toThrow();
    expect(() => classifyCapture("   ")).not.toThrow();
    expect(() => classifyCapture("$$$ ...")).not.toThrow();
  });
});
