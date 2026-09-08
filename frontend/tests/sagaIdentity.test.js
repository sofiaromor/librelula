import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalSagaIdentity,
  getSagaSearchCandidates,
} from "../src/lib/sagaIdentity.js";

test("ACOTAR aliases share one canonical saga", () => {
  assert.deepEqual(canonicalSagaIdentity("una-corte", "Una corte"), {
    key: "acotar",
    name: "ACOTAR",
    known: true,
  });
  assert.equal(
    canonicalSagaIdentity("acotar", "ACOTAR").key,
    canonicalSagaIdentity("una-corte", "Una corte de rosas y espinas").key,
  );
});

test("Mistborn original trilogy editions share one saga but Wax & Wayne does not", () => {
  assert.equal(
    canonicalSagaIdentity(
      "trilogia-original-mistborn-edicion-ilustrada",
      "Trilogía Original Mistborn: edición ilustrada",
    ).key,
    "nacidos-de-la-bruma",
  );
  assert.equal(canonicalSagaIdentity("wax-wayne", "Wax & Wayne").key, "wax-wayne");
});

test("edition and provider prefixes are ignored for grouping", () => {
  assert.equal(
    canonicalSagaIdentity("harry-potter-edicion-ilustrada", "Harry Potter [edición ilustrada").key,
    "harry-potter",
  );
  assert.equal(
    canonicalSagaIdentity("serie-agatha-raisin", "Serie Agatha Raisin").key,
    "agatha-raisin",
  );
});

test("search candidates include old and canonical keys during rollout", () => {
  const candidates = getSagaSearchCandidates(
    "trilogia-original-mistborn-edicion-ilustrada",
    "Trilogía Original Mistborn: edición ilustrada",
  );

  assert.ok(candidates.keys.includes("trilogia-original-mistborn-edicion-ilustrada"));
  assert.ok(candidates.keys.includes("saga-nacidos-de-la-bruma"));
  assert.ok(candidates.keys.includes("nacidos-de-la-bruma"));
});
