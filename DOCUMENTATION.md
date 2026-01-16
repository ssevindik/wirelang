# WireLang — Basit Dokümantasyon

WireLang, elektronik devreleri kodla tarif etmeye yarayan küçük ve açık bir DSL projesidir.

## Hızlı Başlangıç

- Proje kökünde Node/TypeScript ile hazırlanmıştır.
- Geliştirme araçları: `typescript`, `ts-node`, `vitest`.

Kurulum

```bash
# bağımlılıkları yükle
npm install

# TypeScript derlemesi
npm run build

# Örnekleri çalıştır
npm run example

# Testleri çalıştır
npm run test
```

## Ne yapar?

WireLang, devre elemanlarını (rezistör, kondansatör, diyot, LED, kaynaklar, transistörler, op-amp, mantık kapıları vb.) kodla tanımlayıp `Schematic` içine yerleştirmenizi sağlar. Devreler `Circuit`, `Series`, `Parallel` gibi yardımcılarla kolayca oluşturulabilir.

## Ana Kavramlar ve İçe Aktarmalar

Projede sık kullanılan bazı fonksiyon ve bileşenler (örnek):

- `Circuit`, `createSchematic` : Devre/schematic oluşturma.
- Kaynaklar: `DC`, `AC`, `VCC`, `VNEG`.
- Pasifler: `R`, `C`, `L`.
- Diyotlar/LED: `D`, `createLED`, `LED`.
- Topoloji: `Series`, `Parallel`, `Circuit`.
- Mantık kapıları: `NOT`, `AND`, `OR`, `XOR`, `NAND`, `NOR`.
- Yardımcı birimler: `kOhm`, `uF`, `mH`, `kHz`.

Bu semboller `core/components/index.ts` üzerinden yeniden ihrac edilmektedir.

## Basit Kullanım Örneği

playground ve `core/examples.ts` dosyalarından türetilmiş örnekler:

Örnek — Basit LED devresi (DC -> Rezistör -> LED -> GND)

```ts
import { Circuit, DC, R, createLED, GND } from './core';

const ledCircuit = Circuit('LED Blinker',
  DC(5),
  R(330),
  createLED('RED'),
  GND()
);

console.log(ledCircuit.getSummary());
```

Örnek — Inverting OpAmp (playground.ts'tan alınmıştır)

```ts
import { Circuit, OpAmp, R, AC, VCC, VNEG, GND } from './core';

const op = OpAmp('LM741');
const Rin = R(10000); // 10 kΩ
const Rf = R(100000); // 100 kΩ

const invertingAmp = Circuit('Inverting Amplifier (5-pin)', [
  [VCC(15), op.vPos],
  [VNEG(-15), op.vNeg],
  [AC(0.1, 1000), Rin, op.inN],
  [op.inN, Rf, op.out],
  [op.inP, GND()],
]);

console.log(invertingAmp.getSummary());
```

Örnekler koleksiyonu için: [core/examples.ts](core/examples.ts#L1)

## Testler

Projede `vitest` kullanılıyor. Testleri çalıştırmak için:

```bash
npm run test
```

## Geliştirme İpuçları

- Lokal geliştirme yaparken `npm run watch` ile TypeScript dosya değişikliklerini izleyebilirsiniz.
- Kontribüsyon yaparken yeni bileşenleri `core/components` altına ekleyin ve `core/components/index.ts` içinde uygun şekilde export edin.

## Dosyalar

- Proje girişleri ve örnekler: [playground.ts](playground.ts)
- Ana örnek koleksiyonu: [core/examples.ts](core/examples.ts)
- Bileşen ihracatları: [core/components/index.ts](core/components/index.ts)

---

Eğer isterseniz bu dokümanı genişletip `docs/` altına daha fazla örnek ve API referansı ekleyebilirim.
