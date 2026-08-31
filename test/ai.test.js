const test = require("node:test");
const assert = require("node:assert");
const { aiPreset, dataUrlParts, buildRequest, parseResponse, extractJson, imagePrompt, weeklySystemPrompt } = require("../src/ai.js");

test("aiPreset: default anthropic + override modela/baseURL", () => {
  const d = aiPreset({ provider: "anthropic" });
  assert.strictEqual(d.kind, "anthropic");
  assert.strictEqual(d.model, "claude-sonnet-4-6");
  const o = aiPreset({ provider: "anthropic", model: "claude-x", baseURL: "https://proxy.local/" });
  assert.strictEqual(o.model, "claude-x");
  assert.strictEqual(o.baseURL, "https://proxy.local"); // trailing slash strip
});

test("aiPreset: openai-compatible provideri", () => {
  assert.strictEqual(aiPreset({ provider: "deepseek" }).kind, "openai");
  assert.strictEqual(aiPreset({ provider: "deepseek" }).vision, false);
  assert.strictEqual(aiPreset({ provider: "glm" }).vision, true);
});

test("dataUrlParts rastavi mime + base64", () => {
  assert.deepStrictEqual(dataUrlParts("data:image/png;base64,AAAB"), { mime: "image/png", b64: "AAAB" });
});

test("buildRequest anthropic: URL, header, image blok", () => {
  const r = buildRequest({ provider: "anthropic", key: "sk-ant" }, { system: "S", text: "hi", imageDataUrl: "data:image/jpeg;base64,ZZ" });
  assert.strictEqual(r.url, "https://api.anthropic.com/v1/messages");
  assert.strictEqual(r.headers["x-api-key"], "sk-ant");
  assert.strictEqual(r.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.strictEqual(r.body.system, "S");
  const content = r.body.messages[0].content;
  assert.strictEqual(content[0].text, "hi");
  assert.strictEqual(content[1].type, "image");
  assert.strictEqual(content[1].source.media_type, "image/jpeg");
  assert.strictEqual(content[1].source.data, "ZZ");
});

test("buildRequest openai: Bearer, system poruka, image_url", () => {
  const r = buildRequest({ provider: "openai", key: "sk-oa" }, { system: "S", text: "hi", imageDataUrl: "data:image/png;base64,YY" });
  assert.strictEqual(r.url, "https://api.openai.com/v1/chat/completions");
  assert.strictEqual(r.headers.authorization, "Bearer sk-oa");
  assert.strictEqual(r.body.messages[0].role, "system");
  const uc = r.body.messages[1].content;
  assert.strictEqual(uc[1].type, "image_url");
  assert.ok(uc[1].image_url.url.startsWith("data:image/png;base64,"));
});

test("buildRequest openai bez slike: content je goli string", () => {
  const r = buildRequest({ provider: "deepseek", key: "k" }, { text: "hi" });
  assert.strictEqual(r.body.messages[r.body.messages.length - 1].content, "hi");
});

test("parseResponse oba oblika", () => {
  assert.strictEqual(parseResponse({ provider: "anthropic" }, { content: [{ text: "A" }, { text: "B" }] }), "AB");
  assert.strictEqual(parseResponse({ provider: "openai" }, { choices: [{ message: { content: "X" } }] }), "X");
});

test("extractJson: goli, ograđen, s okolnim tekstom", () => {
  assert.deepStrictEqual(extractJson('[{"a":1}]'), [{ a: 1 }]);
  assert.deepStrictEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepStrictEqual(extractJson('Evo:\n{"a":3, "b":"}"}\nkraj'), { a: 3, b: "}" });
});

test("extractJson baci kad nema JSON-a", () => {
  assert.throws(() => extractJson("nema ovdje ničega"));
});

test("extractJson: proza sa zagradama prije pravog JSON-a", () => {
  // Lažna zagrada "[na 100 g]" ne parsira, pravi blok da.
  assert.deepStrictEqual(extractJson('Evo makroa [na 100 g]: [{"name":"Skyr","kcal":63}]'), [{ name: "Skyr", kcal: 63 }]);
});

test("extractJson: uzme najdulji valjani blok, ne prvi mali", () => {
  assert.deepStrictEqual(extractJson('{} then {"a":1,"b":2}'), { a: 1, b: 2 });
});

test("extractJson: JSON pa objašnjenje iza", () => {
  assert.deepStrictEqual(extractJson('[{"a":1}]\n\nNadam se da pomaže!'), [{ a: 1 }]);
});

test("promptovi: weekly spominje jezik, image ima strogi JSON nalog", () => {
  assert.ok(weeklySystemPrompt("de").includes("German"));
  const p = imagePrompt("ing", "en");
  assert.ok(/JSON\.parse/i.test(p.system) && /nothing else/i.test(p.system));
  assert.ok(p.instruction.includes("per 100 g"));
  assert.ok(imagePrompt("train", "en").instruction.includes("exercises"));
  assert.ok(imagePrompt("plate", "en").instruction.includes("slot"));
});
