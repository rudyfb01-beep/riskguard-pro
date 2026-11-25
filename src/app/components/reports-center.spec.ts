import { TestBed } from '@angular/core/testing';
import { ReportsCenter } from './reports-center';

describe('ReportsCenter · pliego de firmas', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReportsCenter] }).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(ReportsCenter);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra tres firmantes con campos de texto editables', () => {
    const { el } = setup();
    expect(el.querySelectorAll('input.signer-field').length).toBe(9);
  });

  it('aplica lo escrito solo al campo editado y permite restablecer', () => {
    const { fixture, cmp, el } = setup();
    const base = cmp.signers();
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Nombre del firmante 2"]')!;
    input.value = 'María Pérez';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(cmp.signers()[1].name).toBe('María Pérez');
    expect(cmp.signers()[1].role).toBe(base[1].role);
    expect(cmp.signers()[0]).toEqual(base[0]);
    expect(cmp.signersEdited()).toBe(true);

    cmp.resetSigners();
    fixture.detectChanges();
    expect(cmp.signers()).toEqual(base);
    expect(cmp.signersEdited()).toBe(false);
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Nombre del firmante 2"]')!.value).toBe(base[1].name);
  });

  it('oculta los campos si se desactiva el pliego de firmas', () => {
    const { fixture, cmp, el } = setup();
    cmp.includeSignatures.set(false);
    fixture.detectChanges();
    expect(el.querySelectorAll('input.signer-field').length).toBe(0);
  });
});
