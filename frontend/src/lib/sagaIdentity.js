const EDITION_MARKER = /(?:edici[oó]n|edition|especial|limitada|ilustrada|coleccionista|aniversario|tapa dura|tapa blanda|bolsillo|r[uú]stica|carton[eé]|hardcover|paperback|box\s*set|pack|estuche)/iu;

const KNOWN_SAGAS = [
  {
    key: "acotar",
    name: "ACOTAR",
    aliases: [
      "ACOTAR",
      "Una corte",
      "Una corte de rosas y espinas",
      "A Court of Thorns and Roses",
    ],
    matches(value) {
      return value === "acotar" || value === "una corte" || value.startsWith("una corte de rosas y espinas") || value === "a court of thorns and roses";
    },
  },
  {
    key: "nacidos-de-la-bruma",
    name: "Nacidos de la bruma",
    aliases: [
      "Nacidos de la bruma",
      "SAGA NACIDOS DE LA BRUMA",
      "Trilogía Original Mistborn",
      "Trilogía Original Mistborn: edición ilustrada",
      "Mistborn",
    ],
    matches(value) {
      return value === "nacidos de la bruma" || value === "mistborn" || value.startsWith("trilogia original mistborn");
    },
  },
  {
    key: "la-asistenta",
    name: "La asistenta",
    aliases: ["La asistenta", "L'assistenta"],
    matches(value) {
      return value === "la asistenta" || value === "l assistenta";
    },
  },
  {
    key: "los-chicos-de-tommen",
    name: "Los chicos de Tommen",
    aliases: ["Los chicos de Tommen", "Estuche Los Chicos de Tommen"],
    matches(value) {
      return value === "los chicos de tommen";
    },
  },
  {
    key: "misterios-en-la-libreria-de-sherlock-holmes",
    name: "Misterios en la librería de Sherlock Holmes",
    aliases: [
      "Misterios en la librería de Sherlock Holmes",
      "Misterios en la Librería Sherlock Holmes",
    ],
    matches(value) {
      return value.startsWith("misterios en la libreria") && value.includes("sherlock holmes");
    },
  },
  {
    key: "charlie-parker",
    name: "Charlie Parker",
    aliases: ["Charlie Parker", "Detective Charlie Parker"],
    matches(value) {
      return value === "charlie parker" || value === "detective charlie parker";
    },
  },
  {
    key: "elena-blanco",
    name: "Elena Blanco",
    aliases: ["Elena Blanco", "Inspectora Elena Blanco"],
    matches(value) {
      return value === "elena blanco" || value === "inspectora elena blanco";
    },
  },
];

function compact(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function normalizeSagaText(value) {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es-ES")
    .replace(/['’`]/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function slugifySaga(value) {
  return normalizeSagaText(value).replace(/\s+/gu, "-") || null;
}

function stripEditionSuffix(value) {
  return compact(value)
    .replace(
      new RegExp(`\\s*(?:[:|–—-]\\s*|[\\[(]\\s*)?(?:${EDITION_MARKER.source})\\b.*$`, "iu"),
      "",
    )
    .trim();
}

function cleanSagaSource(value) {
  let clean = compact(value).replace(/[_-]+/gu, " ");
  clean = clean.replace(/^(?:saga|serie|series)\s+/iu, "");
  clean = clean.replace(/^estuche\s+/iu, "");
  clean = stripEditionSuffix(clean);
  return clean;
}

function findKnownSaga(value) {
  const normalized = normalizeSagaText(cleanSagaSource(value));
  return KNOWN_SAGAS.find((saga) => saga.matches(normalized)) || null;
}

function displaySagaName(value) {
  return cleanSagaSource(value) || compact(value);
}

export function canonicalSagaIdentity(sagaKey = "", sagaName = "") {
  const rawName = compact(sagaName);
  const rawKey = compact(sagaKey);
  const source = rawName || rawKey;
  const known = findKnownSaga(source);
  const cleanName = displaySagaName(source);

  return {
    key: known?.key || slugifySaga(cleanName || source) || "",
    name: known?.name || cleanName,
    known: Boolean(known),
  };
}

export function getSagaSearchCandidates(sagaKey = "", sagaName = "") {
  const rawKey = compact(sagaKey);
  const rawName = compact(sagaName);
  const source = rawName || rawKey;
  const identity = canonicalSagaIdentity(rawKey, rawName);
  const known = findKnownSaga(source);
  const keys = new Set(
    [
      rawKey,
      identity.key,
      slugifySaga(rawName),
      slugifySaga(cleanSagaSource(rawName)),
    ].filter(Boolean),
  );
  const names = new Set(
    [rawName, identity.name, displaySagaName(rawName)].filter(Boolean),
  );

  for (const alias of known?.aliases || []) {
    names.add(alias);
    const aliasKey = slugifySaga(alias);
    if (aliasKey) keys.add(aliasKey);
  }

  return {
    ...identity,
    keys: [...keys],
    names: [...names],
  };
}

export function canonicalSagaLabel(sagaKey = "", sagaName = "") {
  return canonicalSagaIdentity(sagaKey, sagaName).name;
}
