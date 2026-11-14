import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "@/lib/backup-crypto";

const payload = {
  accounts: [{ id: "a1", name: "Cuenta", balance: 1500 }],
  transactions: [{ id: "t1", amount: 250 }],
};

describe("respaldo cifrado (.quid)", () => {
  it("cifra y descifra sin perder datos", async () => {
    const file = await encryptBackup(payload, "clave-segura-123");
    const restored = await decryptBackup(file, "clave-segura-123");
    expect(restored).toEqual(payload);
  });

  it("el archivo no contiene el contenido en claro", async () => {
    const file = await encryptBackup(payload, "clave-segura-123");
    expect(file).not.toContain("Cuenta");
    expect(file).not.toContain("1500");
    expect(file).toContain("quid-backup");
    expect(file).toContain("PBKDF2-SHA256");
  });

  it("falla con contraseña incorrecta", async () => {
    const file = await encryptBackup(payload, "clave-segura-123");
    await expect(decryptBackup(file, "otra-clave-999")).rejects.toThrow(/Contraseña incorrecta/i);
  });

  it("rechaza contraseñas muy cortas", async () => {
    await expect(encryptBackup(payload, "1234")).rejects.toThrow(/al menos 8/i);
  });

  it("rechaza archivos que no son de Quid", async () => {
    await expect(decryptBackup("{\"hola\":1}", "clave-segura-123")).rejects.toThrow(/no es un respaldo/i);
  });
});
