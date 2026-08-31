const test = require("node:test");
const assert = require("node:assert");
const { I18N, translate } = require("../src/i18n.js");

test("hr passthrough (ključ = izvor)", () => {
  assert.strictEqual(translate("hr", "Dodaj"), "Dodaj");
});

test("fallback na ključ kad prijevod fali", () => {
  assert.strictEqual(translate("en", "___nepostojeći___"), "___nepostojeći___");
});

test("{var} zamjena radi i bez unosa u rječnik", () => {
  assert.strictEqual(translate("en", "Barkod {code}", { code: "123" }), "Barkod 123");
});

test("en/de lookup vrati konkretan prijevod", () => {
  assert.strictEqual(translate("en", "Dodaj"), "Add");
  assert.strictEqual(translate("de", "Dodaj"), "Hinzufügen");
});

test("interpolacija u stvarnom ključu", () => {
  assert.strictEqual(translate("en", "Proizvod {code}", { code: "42" }), "Product 42");
  assert.strictEqual(translate("de", "Proizvod {code}", { code: "42" }), "Produkt 42");
});

test("en i de imaju isti skup ključeva", () => {
  const e = Object.keys(I18N.en).sort(), d = Object.keys(I18N.de).sort();
  assert.deepStrictEqual(e, d);
});
