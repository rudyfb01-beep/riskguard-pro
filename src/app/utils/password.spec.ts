import { describe, expect, it } from 'vitest';
import { checkPassword } from './password';

describe('checkPassword', () => {
  it('acepta una frase larga', () => {
    expect(checkPassword('lluvia en el puerto de talcahuano').ok).toBe(true);
    expect(checkPassword('Kx7m-Rq2v-9TbW').ok).toBe(true);
  });

  it('exige 12 caracteres', () => {
    expect(checkPassword('Corta-123').problems).toContain('Debe tener al menos 12 caracteres.');
  });

  it('rechaza contraseñas comunes, repetidas y secuencias', () => {
    expect(checkPassword('Contraseña2026!').ok).toBe(false);
    expect(checkPassword('oriencoop1234').ok).toBe(false);
    expect(checkPassword('aaaaaaaaaaaaaa').ok).toBe(false);
    expect(checkPassword('123456789012').ok).toBe(false);
    expect(checkPassword('abcdefghijklm').ok).toBe(false);
  });

  it('rechaza el correo o el nombre de la persona', () => {
    expect(checkPassword('vmontecinos-2026-x', { email: 'vmontecinos@oriencoop.cl' }).problems).toContain('No incluyas tu correo.');
    expect(checkPassword('Montecinos-del-sur', { name: 'Víctor Montecinos' }).problems).toContain('No incluyas tu nombre o apellido.');
  });

  it('rechaza repetir la anterior', () => {
    expect(checkPassword('Kx7m-Rq2v-9TbW', { previous: 'Kx7m-Rq2v-9TbW' }).ok).toBe(false);
  });
});
