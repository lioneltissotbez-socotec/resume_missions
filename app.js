// Dashboard Missions – Synthèse Liciel (version PRO corrigée)
// -----------------------------------------------------------
// - Scan des missions LICIEL
// - Encodage UTF-8 / Windows-1252 corrigé
// - Conclusions proprement découpées par type de mission
// -----------------------------------------------------------

let rootDirHandle = null;
let allMissions = [];
let filteredMissions = [];
let isScanning = false;

// -----------------------------------------------------------
// 1) Tableau des types de missions
// -----------------------------------------------------------
const MISSION_TYPES = [
  "Amiante (DTA)", "Amiante (Vente)", "Amiante (Travaux)", "Amiante (Démolition)",
  "Diagnostic Termites", "Diagnostic Parasites", "Métrage (Carrez)", "CREP",
  "Assainissement", "Piscine", "Gaz", "Électricité", "Diagnostic Technique Global (DTG)",
  "DPE", "Prêt à taux zéro", "ERP / ESRIS", "État d’Habitabilité", "État des lieux",
  "Plomb dans l’eau", "Ascenseur", "Radon", "Diagnostic Incendie", "Accessibilité Handicapé",
  "Mesurage (Boutin)", "Amiante (DAPP)", "DRIPP", "Performance Numérique", "Infiltrométrie",
  "Amiante (Avant Travaux)", "Gestion Déchets / PEMD", "Plomb (Après Travaux)",
  "Amiante (Contrôle périodique)", "Empoussièrement", "Module Interne",
  "Home Inspection", "Home Inspection 4PT", "Wind Mitigation", "Plomb (Avant Travaux)",
  "Amiante (HAP)", "[Non utilisé]", "DPEG"
];

// -----------------------------------------------------------
// Helpers DOM
// -----------------------------------------------------------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

document.addEventListener("DOMContentLoaded", initUI);

// -----------------------------------------------------------
// 2) Initialisation UI
// -----------------------------------------------------------
function initUI() {
  const btnPickRoot = $("#btnPickRoot");
  const btnScan = $("#btnScan");
  const scanModeRadios = $$("input[name='scanMode']");
  const prefixBlock = $("#prefixBlock");
  const listBlock = $("#listBlock");

  // Vérif File System Access
  const hasFsAccess = Boolean(window.showDirectoryPicker) && window.isSecureContext;
  if (!hasFsAccess) {
    alert("⚠️ Le navigateur doit être en HTTPS ou localhost pour pouvoir ouvrir des dossiers.");
    btnPickRoot.disabled = true;
    return;
  }

  // Modes de scan
  scanModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const mode = getScanMode();
      prefixBlock.classList.toggle("hidden", mode !== "prefix");
      listBlock.classList.toggle("hidden", mode !== "list");
    });
  });

  btnPickRoot.addEventListener("click", onPickRoot);
  btnScan.addEventListener("click", onScan);

  // Filtres
  const debouncedApply = debounce(applyFilters, 200);

  ["#filterDO", "#filterProp", "#filterOp", "#filterType"].forEach((sel) => {
    $(sel).addEventListener("change", debouncedApply);
  });
  $("#filterConclusion").addEventListener("input", debouncedApply);

  $("#btnApplyFilters").addEventListener("click", applyFilters);
  $("#btnResetFilters").addEventListener("click", resetFilters);

  // Export
  $("#btnExportCSV").addEventListener("click", exportFilteredAsCSV);
  $("#btnCopyClipboard").addEventListener("click", copyFilteredToClipboard);
  $("#btnExportJSON").addEventListener("click", exportAllAsJSON);
  $("#btnImportJSON").addEventListener("click", () => $("#jsonFileInput").click());
  $("#jsonFileInput").addEventListener("change", onImportJSON);

  // Modales
  $("#btnCloseModal").addEventListener("click", closeConclusionModal);
  $("#modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeConclusionModal();
  });

  $("#btnClosePhoto").addEventListener("click", closePhotoModal);
  $("#photoOverlay").addEventListener("click", (e) => {
    if (e.target.id === "photoOverlay") closePhotoModal();
  });

  updateProgress(0, 0, "En attente…");
}

// -----------------------------------------------------------
// 3) Scan & sélection dossier
// -----------------------------------------------------------
function getScanMode() {
  const selected = document.querySelector("input[name='scanMode']:checked");
  return selected ? selected.value : "all";
}

async function onPickRoot() {
  try {
    rootDirHandle = await window.showDirectoryPicker();
    $("#rootInfo").textContent = "Dossier sélectionné : " + rootDirHandle.name;
    $("#btnScan").disabled = false;
  } catch (err) {
    console.warn("Sélection annulée :", err);
  }
}

async function onScan() {
  if (!rootDirHandle) {
    alert("Sélectionne d'abord un dossier racine.");
    return;
  }

  const mode = getScanMode();
  const prefix = $("#inputPrefix").value.trim();
  const listText = $("#inputDossierList").value.trim();
  let listItems = [];

  if (mode === "prefix" && !prefix) {
    alert("Saisis un préfixe.");
    return;
  }

  if (mode === "list") {
    listItems = listText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s);
    if (!listItems.length) {
      alert("Colle au moins un numéro de dossier.");
      return;
    }
  }

  isScanning = true;
  allMissions = [];
  filteredMissions = [];
  renderTable();

  $("#btnScan").disabled = true;
  $("#btnPickRoot").disabled = true;

  updateProgress(0, 0, "Recherche des sous-dossiers…");

  // Récupération dossiers
  const entries = [];
  for await (const [name, handle] of rootDirHandle.entries()) {
    if (handle.kind === "directory") entries.push({ name, handle });
  }

  const candidates = entries.filter(({ name }) => {
    if (mode === "all") return true;
    if (mode === "prefix") return name.startsWith(prefix);
    if (mode === "list") return listItems.some((x) => name.startsWith(x));
    return true;
  });

  if (!candidates.length) {
    alert("Aucun dossier trouvé.");
    return;
  }

  if (candidates.length > 100) {
    if (!confirm(`Scanner ${candidates.length} dossiers ?`)) return;
  }

  let processed = 0;
  const total = candidates.length;

  for (const { name, handle } of candidates) {
    try {
      const mission = await processMissionFolder(handle, name);
      if (mission) allMissions.push(mission);
    } catch (err) {
      console.error("Erreur sur dossier", name, err);
    }
    processed++;
    updateProgress(processed, total, `Scan : ${processed}/${total}`);
  }

  filteredMissions = [...allMissions];
  populateFilterOptions();
  renderTable();
  updateStats();
  updateExportButtonsState();

  $("#filtersSection").classList.remove("hidden-block");

  isScanning = false;
  $("#btnScan").disabled = false;
  $("#btnPickRoot").disabled = false;

  updateProgress(total, total, "Scan terminé !");
}

// -----------------------------------------------------------
// 4) LECTURE XML AVEC GESTION D’ENCODAGE (UTF-8 / Windows-1252)
// -----------------------------------------------------------
async function readXmlFile(dirHandle, fileName) {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();

    // 1) lecture UTF-8
    let textUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    let text = textUtf8;

    // 2) Détection éventuelle d'encodage déclaré
    const m = textUtf8.match(/encoding="([^"]+)"/i);
    const declared = m?.[1]?.toLowerCase() ?? null;

    if (declared && declared !== "utf-8") {
      try {
        text = new TextDecoder(declared).decode(buffer);
      } catch {
        // fallback Windows-1252
        try {
          text = new TextDecoder("windows-1252").decode(buffer);
        } catch {}
      }
    } else {
      // 3) Heuristique si beaucoup de "�"
      const badUtf8 = (textUtf8.match(/�/g) || []).length;
      if (badUtf8 >= 3) {
        try {
          const text1252 = new TextDecoder("windows-1252").decode(buffer);
          const bad1252 = (text1252.match(/�/g) || []).length;
          if (bad1252 < badUtf8) text = text1252;
        } catch {}
      }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");

    if (doc.querySelector("parsererror")) {
      console.error("Erreur XML :", fileName);
      return null;
    }

    return doc;

  } catch (err) {
    console.warn(`Impossible de lire ${fileName}`, err);
    return null;
  }
}

function getXmlValue(xmlDoc, tagName) {
  const el = xmlDoc.querySelector(tagName);
  return el ? (el.textContent || "").trim() : "";
}

// -----------------------------------------------------------
// 5) Décodage des missions effectuées
// -----------------------------------------------------------
function decodeMissions(bits) {
  if (!bits) return [];
  const result = [];
  for (let i = 0; i < bits.length && i < MISSION_TYPES.length; i++) {
    if (bits[i] === "1") result.push(MISSION_TYPES[i]);
  }
  return result;
}

// -----------------------------------------------------------
// 6) Découpe des CONCLUSIONS par type de mission
// -----------------------------------------------------------
function buildConclusionsList(rawText, missionsEffectuees) {
  if (!rawText) return [];

  let txt = rawText.replace(/\s+/g, " ").trim();
  const setEff = new Set(missionsEffectuees || []);

  // Repérer positions de chaque libellé
  const found = [];
  MISSION_TYPES.forEach((label) => {
    const idx = txt.indexOf(label);
    if (idx !== -1) found.push({ label, idx });
  });

  if (!found.length) return [];

  found.sort((a, b) => a.idx - b.idx);

  const results = [];
  for (let i = 0; i < found.length; i++) {
    const { label, idx } = found[i];
    const start = idx + label.length;
    const end   = i + 1 < found.length ? found[i + 1].idx : txt.length;

    let chunk = txt.slice(start, end).trim();

    chunk = chunk.replace(/^[0-9\s:()\-]+/, "").trim();

    if (!chunk) continue;
    if (!setEff.has(label)) continue;

    results.push({ type: label, text: chunk });
  }

  return results;
}

// -----------------------------------------------------------
// 7) Traitement d’un dossier de mission
// -----------------------------------------------------------
async function processMissionFolder(folderHandle, folderName) {
  let xmlDir;
  try {
    xmlDir = await folderHandle.getDirectoryHandle("XML");
  } catch {
    return null;
  }

  // --- Table_General_Bien ---
  const bienXml = await readXmlFile(xmlDir, "Table_General_Bien.xml");
  if (!bienXml) return null;

  const mission = {};
  mission.numDossier = getXmlValue(bienXml, "LiColonne_Mission_Num_Dossier") || folderName;

  mission.donneurOrdre = {
    nom: getXmlValue(bienXml, "LiColonne_DOrdre_Nom"),
    entete: getXmlValue(bienXml, "LiColonne_DOrdre_Entete"),
  };

  mission.proprietaire = {
    nom: getXmlValue(bienXml, "LiColonne_Prop_Nom"),
    entete: getXmlValue(bienXml, "LiColonne_Prop_Entete"),
  };

  mission.immeuble = {
    adresse: getXmlValue(bienXml, "LiColonne_Immeuble_Adresse1"),
    commune: getXmlValue(bienXml, "LiColonne_Immeuble_Commune")
  };

  const missionsBits = getXmlValue(bienXml, "LiColonne_Mission_Missions_programmees");
  mission.mission = {
    missionsProgrammes: missionsBits,
    missionsEffectuees: decodeMissions(missionsBits),
    dateVisite: getXmlValue(bienXml, "LiColonne_Mission_Date_Visite"),
    dateRapport: getXmlValue(bienXml, "LiColonne_Mission_Date_Rapport"),
  };

  // --- Conclusion ---
  const conclXml = await readXmlFile(xmlDir, "Table_General_Bien_conclusions.xml");
  let raw = "";
  if (conclXml) {
    const node =
      conclXml.querySelector("Conclusion") ||
      conclXml.querySelector("LiColonne_Conclusion") ||
      conclXml.querySelector("Texte") ||
      conclXml.documentElement;

    raw = node ? (node.textContent || "").trim() : "";
  }

  mission.conclusionRaw = raw;
  mission.conclusionsList = buildConclusionsList(raw, mission.mission.missionsEffectuees);
  mission.conclusion = raw;

  mission._norm = { conclusion: raw.toLowerCase() };

  return mission;
}

// -----------------------------------------------------------
// 8) AFFICHAGE DES CONCLUSIONS EN TABLEAU
// -----------------------------------------------------------
function openConclusionModal(mission) {
  const overlay = $("#modalOverlay");
  const content = $("#modalContent");

  const list = mission.conclusionsList || [];
  content.innerHTML = "";

  if (list.length) {
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    table.innerHTML = `
      <thead>
        <tr>
          <th style="border-bottom:1px solid #e5e7eb;padding:4px 6px;">Type</th>
          <th style="border-bottom:1px solid #e5e7eb;padding:4px 6px;">Conclusion</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement("tbody");

    list.forEach((item) => {
      const tr = document.createElement("tr");

      const tdType = document.createElement("td");
      tdType.style.padding = "4px 6px";
      tdType.textContent = item.type;

      const tdText = document.createElement("td");
      tdText.style.padding = "4px 6px";
      tdText.textContent = item.text;

      tr.appendChild(tdType);
      tr.appendChild(tdText);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    content.appendChild(table);

  } else {
    content.textContent = mission.conclusionRaw || "Aucune conclusion trouvée.";
  }

  overlay.classList.remove("hidden");
}

function closeConclusionModal() {
  $("#modalOverlay").classList.add("hidden");
}

// -----------------------------------------------------------
// 9) Rendu du tableau
// -----------------------------------------------------------
function renderTable() {
  const tbody = $("#resultsTable tbody");
  tbody.innerHTML = "";

  filteredMissions.forEach((m) => {
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = m.numDossier;

    const tdDO = document.createElement("td");
    tdDO.textContent = m.donneurOrdre.entete + " " + m.donneurOrdre.nom;

    const tdProp = document.createElement("td");
    tdProp.textContent = m.proprietaire.entete + " " + m.proprietaire.nom;

    const tdAdr = document.createElement("td");
    tdAdr.textContent = m.immeuble.adresse + " " + m.immeuble.commune;

    const tdDates = document.createElement("td");
    tdDates.textContent = (m.mission.dateVisite || "") + "\n" + (m.mission.dateRapport || "");

    const tdMissions = document.createElement("td");
    m.mission.missionsEffectuees.forEach((type) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = type;
      tdMissions.appendChild(tag);
    });

    const tdConclusion = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn-link";
    btn.textContent = "Voir";
    btn.onclick = () => openConclusionModal(m);
    tdConclusion.appendChild(btn);

    tr.append(tdNum, tdDO, tdProp, tdAdr, tdDates, tdMissions, tdConclusion);
    tbody.appendChild(tr);
  });
}

// -----------------------------------------------------------
// 10) Filtres
// -----------------------------------------------------------
function populateFilterOptions() {
  const doSel = $("#filterDO");
  const propSel = $("#filterProp");
  const opSel = $("#filterOp");
  const typeSel = $("#filterType");

  doSel.innerHTML = "";
  propSel.innerHTML = "";
  opSel.innerHTML = "";
  typeSel.innerHTML = "";

  const DOset = new Set();
  const PropSet = new Set();
  const TypeSet = new Set();

  allMissions.forEach((m) => {
    DOset.add((m.donneurOrdre.entete + " " + m.donneurOrdre.nom).trim());
    PropSet.add((m.proprietaire.entete + " " + m.proprietaire.nom).trim());
    m.mission.missionsEffectuees.forEach((t) => TypeSet.add(t));
  });

  [...DOset].sort().forEach((x) => doSel.add(new Option(x, x)));
  [...PropSet].sort().forEach((x) => propSel.add(new Option(x, x)));
  [...TypeSet].sort().forEach((x) => typeSel.add(new Option(x, x)));
}

function applyFilters() {
  const doValues = getSelectedValues("#filterDO");
  const propValues = getSelectedValues("#filterProp");
  const typeValues = getSelectedValues("#filterType");
  const concl = $("#filterConclusion").value.toLowerCase();

  filteredMissions = allMissions.filter((m) => {
    const doLabel = (m.donneurOrdre.entete + " " + m.donneurOrdre.nom).trim();
    const propLabel = (m.proprietaire.entete + " " + m.proprietaire.nom).trim();

    if (doValues.length && !doValues.includes(doLabel)) return false;
    if (propValues.length && !propValues.includes(propLabel)) return false;

    if (typeValues.length) {
      const ok = m.mission.missionsEffectuees.some((t) => typeValues.includes(t));
      if (!ok) return false;
    }

    if (concl && !m.conclusionRaw.toLowerCase().includes(concl)) return false;

    return true;
  });

  renderTable();
}

function resetFilters() {
  ["#filterDO", "#filterProp", "#filterType"].forEach((sel) => {
    const el = $(sel);
    Array.from(el.options).forEach((o) => (o.selected = false));
  });
  $("#filterConclusion").value = "";
  filteredMissions = [...allMissions];
  renderTable();
}

function getSelectedValues(sel) {
  return Array.from($(sel).selectedOptions).map((o) => o.value);
}

// -----------------------------------------------------------
// 11) Export CSV / JSON
// -----------------------------------------------------------
function exportFilteredAsCSV() {
  if (!filteredMissions.length) {
    alert("Aucune mission filtrée.");
    return;
  }

  const lines = ["num_dossier"];
  filteredMissions.forEach((m) => lines.push(m.numDossier));

  downloadFile(lines.join("\r\n"), "missions_filtrees.csv", "text/csv");
}

function copyFilteredToClipboard() {
  if (!filteredMissions.length) return;

  const txt = filteredMissions.map((m) => m.numDossier).join("\n");
  navigator.clipboard.writeText(txt);
  alert("Copié !");
}

function exportAllAsJSON() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    missions: allMissions.map((m) => ({
      ...m,
      photoUrl: null
    }))
  };
  downloadFile(JSON.stringify(payload, null, 2), "missions_export.json", "application/json");
}

function onImportJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      allMissions = json.missions || json;
      filteredMissions = [...allMissions];
      populateFilterOptions();
      renderTable();
    } catch (err) {
      alert("Erreur JSON");
    }
  };
  reader.readAsText(file, "utf-8");
}

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------
// 12) Modale photo
// -----------------------------------------------------------
function openPhotoModal(url) {
  $("#modalPhoto").src = url;
  $("#photoOverlay").classList.remove("hidden");
}

function closePhotoModal() {
  $("#photoOverlay").classList.add("hidden");
  $("#modalPhoto").src = "";
}

// -----------------------------------------------------------
function updateProgress(done, total, text) {
  const fill = $("#progressFill");
  const label = $("#progressText");
  const pct = total ? Math.round(done / total * 100) : 0;
  fill.style.width = pct + "%";
  label.textContent = text;
}

function updateStats() {
  $("#statsText").textContent = `${filteredMissions.length} missions affichées / ${allMissions.length}`;
}

function updateExportButtonsState() {
  $("#btnExportCSV").disabled = !filteredMissions.length;
  $("#btnCopyClipboard").disabled = !filteredMissions.length;
  $("#btnExportJSON").disabled = !allMissions.length;
}
