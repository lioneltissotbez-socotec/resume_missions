// Dashboard Missions – Synthèse Liciel
// Utilise la File System Access API (Chrome / Edge récents).

let rootDirHandle = null;
let allMissions = [];
let filteredMissions = [];

const MISSION_TYPES = [
  "Amiante (DTA)",                 // 00
  "Amiante (Vente)",               // 01
  "Amiante (Travaux)",             // 02
  "Amiante (Démolition)",          // 03
  "Diagnostic Termites",           // 04
  "Diagnostic Parasites",          // 05
  "Métrage (Carrez)",              // 06
  "CREP",                          // 07
  "Assainissement",                // 08
  "Piscine",                       // 09
  "Gaz",                           // 10
  "Électricité",                   // 11
  "Diagnostic Technique Global (DTG)", // 12
  "DPE",                           // 13
  "Prêt à taux zéro",              // 14
  "ERP / ESRIS",                   // 15
  "État d’Habitabilité",           // 16
  "État des lieux",                // 17
  "Plomb dans l’eau",              // 18
  "Ascenseur",                     // 19
  "Radon",                         // 20
  "Diagnostic Incendie",           // 21
  "Accessibilité Handicapé",       // 22
  "Mesurage (Boutin)",             // 23
  "Amiante (DAPP)",                // 24
  "DRIPP",                         // 25
  "Performance Numérique",         // 26
  "Infiltrométrie",                // 27
  "Amiante (Avant Travaux)",       // 28
  "Gestion Déchets / PEMD",        // 29
  "Plomb (Après Travaux)",         // 30
  "Amiante (Contrôle périodique)", // 31
  "Empoussièrement",               // 32
  "Module Interne",                // 33
  "Home Inspection",               // 34
  "Home Inspection 4PT",           // 35
  "Wind Mitigation",               // 36
  "Plomb (Avant Travaux)",         // 37
  "Amiante (HAP)",                 // 38
  "[Non utilisé]",                 // 39
  "DPEG"                           // 40
];

// Raccourcis DOM
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

document.addEventListener("DOMContentLoaded", () => {
  initUI();
});

function initUI() {
  const btnPickRoot = $("#btnPickRoot");
  const btnScan = $("#btnScan");
  const scanModeRadios = $$("input[name='scanMode']");

  const prefixBlock = $("#prefixBlock");
  const listBlock = $("#listBlock");

  const btnApplyFilters = $("#btnApplyFilters");
  const btnResetFilters = $("#btnResetFilters");

  const btnExportCSV = $("#btnExportCSV");
  const btnCopyClipboard = $("#btnCopyClipboard");
  const btnExportJSON = $("#btnExportJSON");
  const btnImportJSON = $("#btnImportJSON");
  const jsonFileInput = $("#jsonFileInput");

  const btnCloseModal = $("#btnCloseModal");
  const btnClosePhoto = $("#btnClosePhoto");

  if (!window.showDirectoryPicker) {
    alert("⚠️ Votre navigateur ne supporte pas la File System Access API. Utilisez Chrome ou Edge récents.");
  }

  scanModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const mode = getScanMode();
      prefixBlock.classList.toggle("hidden", mode !== "prefix");
      listBlock.classList.toggle("hidden", mode !== "list");
    });
  });

  btnPickRoot.addEventListener("click", onPickRoot);
  btnScan.addEventListener("click", onScan);

  btnApplyFilters.addEventListener("click", applyFilters);
  btnResetFilters.addEventListener("click", resetFilters);

  $("#filterConclusion").addEventListener("keyup", (e) => {
    if (e.key === "Enter") applyFilters();
  });

  btnExportCSV.addEventListener("click", exportFilteredAsCSV);
  btnCopyClipboard.addEventListener("click", copyFilteredToClipboard);
  btnExportJSON.addEventListener("click", exportAllAsJSON);
  btnImportJSON.addEventListener("click", () => jsonFileInput.click());
  jsonFileInput.addEventListener("change", onImportJSON);

  btnCloseModal.addEventListener("click", closeConclusionModal);
  $("#modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeConclusionModal();
  });

  btnClosePhoto.addEventListener("click", closePhotoModal);
  $("#photoOverlay").addEventListener("click", (e) => {
    if (e.target.id === "photoOverlay") closePhotoModal();
  });

  updateProgress(0, 0, "En attente…");
  updateStats();
}

function getScanMode() {
  const selected = document.querySelector("input[name='scanMode']:checked");
  return selected ? selected.value : "all";
}

async function onPickRoot() {
  try {
    rootDirHandle = await window.showDirectoryPicker();
    $("#rootInfo").textContent = "Dossier racine : " + rootDirHandle.name;
  } catch (err) {
    console.warn("Sélection de dossier annulée :", err);
  }
}

async function onScan() {
  if (!rootDirHandle) {
    alert("Veuillez d'abord choisir un dossier racine.");
    return;
  }

  const mode = getScanMode();
  const prefix = $("#inputPrefix").value.trim();
  const listText = $("#inputDossierList").value.trim();

  let listItems = [];
  if (listText) {
    listItems = listText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => !!s);
  }

  if (mode === "prefix" && !prefix) {
    alert("Veuillez saisir un préfixe de dossier.");
    return;
  }
  if (mode === "list" && listItems.length === 0) {
    alert("Veuillez coller au moins un numéro de dossier.");
    return;
  }

  allMissions = [];
  filteredMissions = [];
  renderTable();
  updateStats();

  $("#progressText").textContent = "Scan des sous-dossiers en cours…";
  updateProgress(0, 0, "Préparation du scan…");

  const allEntries = [];
  for await (const [name, handle] of rootDirHandle.entries()) {
    if (handle.kind === "directory") {
      allEntries.push({ name, handle });
    }
  }

  const candidates = allEntries.filter(({ name }) => {
    if (mode === "all") return true;
    if (mode === "prefix") {
      return name.startsWith(prefix);
    }
    if (mode === "list") {
      return listItems.some((item) => name.startsWith(item));
    }
    return true;
  });

  if (candidates.length === 0) {
    alert("Aucun dossier ne correspond aux critères.");
    updateProgress(0, 0, "Aucun dossier trouvé.");
    return;
  }

  if (candidates.length > 50) {
    const proceed = confirm(
      `Vous allez scanner ${candidates.length} dossiers. Voulez-vous continuer ?`
    );
    if (!proceed) {
      updateProgress(0, 0, "Scan annulé par l'utilisateur.");
      return;
    }
  }

  let processed = 0;
  const total = candidates.length;

  for (const { name, handle } of candidates) {
    try {
      const mission = await processMissionFolder(handle, name);
      if (mission) {
        allMissions.push(mission);
      }
    } catch (err) {
      console.error("Erreur lors du traitement du dossier", name, err);
    }
    processed++;
    updateProgress(processed, total, `Scan : ${processed} / ${total} dossiers…`);
  }

  filteredMissions = [...allMissions];
  populateFilterOptions();
  renderTable();
  updateStats();
  updateProgress(total, total, `Scan terminé : ${allMissions.length} missions valides.`);
}

async function processMissionFolder(folderHandle, folderName) {
  let xmlDir;
  try {
    xmlDir = await folderHandle.getDirectoryHandle("XML");
  } catch (err) {
    console.warn(`Dossier XML manquant dans ${folderName}`);
    return null;
  }

  const bienXml = await readXmlFile(xmlDir, "Table_General_Bien.xml");
  if (!bienXml) {
    console.warn(`Table_General_Bien.xml manquant dans ${folderName}`);
    return null;
  }

  const mission = {};

  mission.numDossier = getXmlValue(bienXml, "LiColonne_Mission_Num_Dossier") || folderName;

  mission.donneurOrdre = {
    nom: getXmlValue(bienXml, "LiColonne_DOrdre_Nom"),
    entete: getXmlValue(bienXml, "LiColonne_DOrdre_Entete"),
    adresse: getXmlValue(bienXml, "LiColonne_DOrdre_Adresse1"),
    departement: getXmlValue(bienXml, "LiColonne_DOrdre_Departement"),
    commune: getXmlValue(bienXml, "LiColonne_DOrdre_Commune")
  };

  mission.proprietaire = {
    entete: getXmlValue(bienXml, "LiColonne_Prop_Entete"),
    nom: getXmlValue(bienXml, "LiColonne_Prop_Nom"),
    adresse: getXmlValue(bienXml, "LiColonne_Prop_Adresse1"),
    departement: getXmlValue(bienXml, "LiColonne_Prop_Departement"),
    commune: getXmlValue(bienXml, "LiColonne_Prop_Commune")
  };

  mission.immeuble = {
    adresse: getXmlValue(bienXml, "LiColonne_Immeuble_Adresse1"),
    departement: getXmlValue(bienXml, "LiColonne_Immeuble_Departement"),
    commune: getXmlValue(bienXml, "LiColonne_Immeuble_Commune"),
    lot: getXmlValue(bienXml, "LiColonne_Immeuble_Lot"),
    natureBien: getXmlValue(bienXml, "LiColonne_Immeuble_Nature_bien"),
    typeBien: getXmlValue(bienXml, "LiColonne_Immeuble_Type_bien"),
    typeDossier: getXmlValue(bienXml, "LiColonne_Immeuble_Type_Dossier"),
    description: getXmlValue(bienXml, "LiColonne_Immeuble_Description")
  };

  const missionsProgrammes = getXmlValue(bienXml, "LiColonne_Mission_Missions_programmees");
  mission.mission = {
    dateVisite: getXmlValue(bienXml, "LiColonne_Mission_Date_Visite"),
    dateRapport: getXmlValue(bienXml, "LiColonne_Mission_Date_Rapport"),
    missionsProgrammes,
    missionsEffectuees: decodeMissions(missionsProgrammes)
  };

  mission.operateur = {
    nomFamille: getXmlValue(bienXml, "LiColonne_Gen_Nom_operateur_UniquementNomFamille"),
    prenom: getXmlValue(bienXml, "LiColonne_Gen_Nom_operateur_UniquementPreNom"),
    certifSociete: getXmlValue(bienXml, "LiColonne_Gen_certif_societe"),
    numCertif: getXmlValue(bienXml, "LiColonne_Gen_num_certif")
  };

  const conclXml = await readXmlFile(xmlDir, "Table_General_Bien_conclusions.xml");
  if (conclXml) {
    const conclNode = conclXml.querySelector("Conclusion") || conclXml.documentElement;
    mission.conclusion = conclNode ? conclNode.textContent.trim() : "";
  } else {
    mission.conclusion = "";
  }

  mission.photoUrl = null;
  mission.photoPath = null;

  const photoXml = await readXmlFile(xmlDir, "Table_General_Photo.xml");
  if (photoXml) {
    try {
      const photoInfo = await extractPresentationPhoto(photoXml, folderHandle);
      if (photoInfo) {
        mission.photoUrl = photoInfo.url;
        mission.photoPath = photoInfo.path;
      }
    } catch (err) {
      console.warn("Erreur lors de l'extraction de la photo dans", folderName, err);
    }
  }

  return mission;
}

async function readXmlFile(dirHandle, fileName) {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) {
      console.error("Erreur de parsing XML pour", fileName);
      return null;
    }
    return doc;
  } catch (err) {
    console.warn("Impossible de lire le fichier XML", fileName, err);
    return null;
  }
}

function getXmlValue(xmlDoc, tagName) {
  const el = xmlDoc.querySelector(tagName);
  return el ? (el.textContent || "").trim() : "";
}

function decodeMissions(bits) {
  if (!bits) return [];
  const result = [];
  for (let i = 0; i < bits.length && i < MISSION_TYPES.length; i++) {
    if (bits[i] === "1") {
      result.push(MISSION_TYPES[i]);
    }
  }
  return result;
}

async function extractPresentationPhoto(photoXml, missionFolderHandle) {
  let pathText = null;

  const rows = photoXml.querySelectorAll("ROW, Row, row, Photo, PHOTO");
  for (const row of rows) {
    const typeNode =
      row.querySelector("TypePhoto") ||
      row.querySelector("Type") ||
      row.querySelector("Libelle") ||
      row.querySelector("Colonne") ||
      row.querySelector("Champ");
    const typeText = typeNode ? typeNode.textContent.trim().toLowerCase() : "";

    if (typeText.includes("présentation") || typeText.includes("presentation")) {
      const fileNode =
        row.querySelector("Fichier") ||
        row.querySelector("Chemin") ||
        row.querySelector("Path") ||
        row.querySelector("NomFichier");
      if (fileNode && fileNode.textContent.trim()) {
        pathText = fileNode.textContent.trim();
        break;
      }
    }
  }

  if (!pathText) {
    return null;
  }

  const normalizedPath = pathText.replace(/\\/g, "/").replace(/\/g, "/");

  try {
    const file = await getFileFromRelativePath(missionFolderHandle, normalizedPath);
    const blobUrl = URL.createObjectURL(file);
    return { url: blobUrl, path: normalizedPath };
  } catch (err) {
    console.warn("Impossible de retrouver le fichier image via", normalizedPath, err);
    return null;
  }
}

async function getFileFromRelativePath(rootHandle, relPath) {
  const parts = relPath.split("/").filter((p) => !!p && p !== ".");

  let current = rootHandle;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    if (isLast) {
      const fileHandle = await current.getFileHandle(part);
      return fileHandle.getFile();
    } else {
      current = await current.getDirectoryHandle(part);
    }
  }
  throw new Error("Chemin vide");
}

function updateProgress(done, total, text) {
  const bar = $("#progressFill");
  const label = $("#progressText");
  let percent = 0;
  if (total > 0) {
    percent = Math.round((done / total) * 100);
  }
  bar.style.width = percent + "%";
  if (label) label.textContent = text || "";
}

function populateFilterOptions() {
  const doSelect = $("#filterDO");
  const propSelect = $("#filterProp");
  const opSelect = $("#filterOp");
  const typeSelect = $("#filterType");

  doSelect.innerHTML = "";
  propSelect.innerHTML = "";
  opSelect.innerHTML = "";
  typeSelect.innerHTML = "";

  const DOset = new Set();
  const PropSet = new Set();
  const OpSet = new Set();
  const TypeSet = new Set();

  for (const m of allMissions) {
    const doLabel = formatDonneurOrdre(m);
    if (doLabel) DOset.add(doLabel);

    const propLabel = formatProprietaire(m);
    if (propLabel) PropSet.add(propLabel);

    const opLabel = formatOperateur(m);
    if (opLabel) OpSet.add(opLabel);

    (m.mission.missionsEffectuees || []).forEach((t) => TypeSet.add(t));
  }

  [...DOset].sort().forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    doSelect.appendChild(opt);
  });

  [...PropSet].sort().forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    propSelect.appendChild(opt);
  });

  [...OpSet].sort().forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    opSelect.appendChild(opt);
  });

  [...TypeSet].sort().forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    typeSelect.appendChild(opt);
  });
}

function applyFilters() {
  const doValues = getSelectedOptions("#filterDO");
  const propValues = getSelectedOptions("#filterProp");
  const opValues = getSelectedOptions("#filterOp");
  const typeValues = getSelectedOptions("#filterType");
  const conclText = ($("#filterConclusion").value || "").trim().toLowerCase();

  filteredMissions = allMissions.filter((m) => {
    if (doValues.length) {
      const label = formatDonneurOrdre(m);
      if (!doValues.includes(label)) return false;
    }

    if (propValues.length) {
      const label = formatProprietaire(m);
      if (!propValues.includes(label)) return false;
    }

    if (opValues.length) {
      const label = formatOperateur(m);
      if (!opValues.includes(label)) return false;
    }

    if (typeValues.length) {
      const missionTypes = m.mission.missionsEffectuees || [];
      const ok = missionTypes.some((t) => typeValues.includes(t));
      if (!ok) return false;
    }

    if (conclText) {
      const c = (m.conclusion || "").toLowerCase();
      if (!c.includes(conclText)) return false;
    }

    return true;
  });

  renderTable();
  updateStats();
}

function resetFilters() {
  ["#filterDO", "#filterProp", "#filterOp", "#filterType"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    Array.from(el.options).forEach((opt) => (opt.selected = false));
  });
  $("#filterConclusion").value = "";
  filteredMissions = [...allMissions];
  renderTable();
  updateStats();
}

function getSelectedOptions(selector) {
  const select = $(selector);
  if (!select) return [];
  return Array.from(select.selectedOptions).map((o) => o.value);
}

function formatDonneurOrdre(m) {
  const d = m.donneurOrdre || {};
  const parts = [];
  if (d.entete) parts.push(d.entete);
  if (d.nom) parts.push(d.nom);
  return parts.join(" ");
}

function formatProprietaire(m) {
  const p = m.proprietaire || {};
  const parts = [];
  if (p.entete) parts.push(p.entete);
  if (p.nom) parts.push(p.nom);
  return parts.join(" ");
}

function formatOperateur(m) {
  const o = m.operateur || {};
  const parts = [];
  if (o.nomFamille || o.prenom) {
    parts.push([o.nomFamille, o.prenom].filter(Boolean).join(" "));
  }
  if (o.certifSociete) {
    parts.push("(" + o.certifSociete + ")");
  }
  return parts.join(" ");
}

function renderTable() {
  const tbody = $("#resultsTable tbody");
  tbody.innerHTML = "";

  for (const m of filteredMissions) {
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = m.numDossier || "";
    tr.appendChild(tdNum);

    const tdDO = document.createElement("td");
    tdDO.textContent = formatDonneurOrdre(m);
    tr.appendChild(tdDO);

    const tdProp = document.createElement("td");
    tdProp.textContent = formatProprietaire(m);
    tr.appendChild(tdProp);

    const tdAdr = document.createElement("td");
    const im = m.immeuble || {};
    tdAdr.textContent = [im.adresse, im.departement, im.commune]
      .filter(Boolean)
      .join(" ");
    tr.appendChild(tdAdr);

    const tdType = document.createElement("td");
    tdType.textContent = [m.immeuble.typeBien, m.immeuble.natureBien, m.immeuble.typeDossier]
      .filter(Boolean)
      .join(" / ");
    tr.appendChild(tdType);

    const tdDates = document.createElement("td");
    tdDates.textContent = [
      m.mission.dateVisite ? "Visite : " + m.mission.dateVisite : "",
      m.mission.dateRapport ? "Rapport : " + m.mission.dateRapport : ""
    ]
      .filter(Boolean)
      .join("\n");
    tr.appendChild(tdDates);

    const tdOp = document.createElement("td");
    tdOp.textContent = formatOperateur(m);
    if (m.operateur.numCertif) {
      const small = document.createElement("div");
      small.style.fontSize = "11px";
      small.style.color = "#6b7280";
      small.textContent = "Certif : " + m.operateur.numCertif;
      tdOp.appendChild(document.createElement("br"));
      tdOp.appendChild(small);
    }
    tr.appendChild(tdOp);

    const tdMissions = document.createElement("td");
    (m.mission.missionsEffectuees || []).forEach((type) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = type;
      tdMissions.appendChild(span);
    });
    tr.appendChild(tdMissions);

    const tdConclusion = document.createElement("td");
    if (m.conclusion) {
      const btn = document.createElement("button");
      btn.className = "btn-link";
      btn.textContent = "Voir";
      btn.addEventListener("click", () => openConclusionModal(m));
      tdConclusion.appendChild(btn);

      const preview = document.createElement("div");
      preview.style.fontSize = "11px";
      preview.style.color = "#6b7280";
      preview.style.marginTop = "2px";
      const shortText = m.conclusion.length > 120
        ? m.conclusion.slice(0, 120) + "…"
        : m.conclusion;
      preview.textContent = shortText;
      tdConclusion.appendChild(preview);
    } else {
      tdConclusion.textContent = "";
    }
    tr.appendChild(tdConclusion);

    const tdPhoto = document.createElement("td");
    if (m.photoUrl) {
      const img = document.createElement("img");
      img.src = m.photoUrl;
      img.alt = "Photo présentation";
      img.className = "photo-thumb";
      img.addEventListener("click", () => openPhotoModal(m.photoUrl));
      tdPhoto.appendChild(img);
    } else if (m.photoPath) {
      const span = document.createElement("span");
      span.className = "photo-placeholder";
      span.textContent = "Chemin : " + m.photoPath;
      tdPhoto.appendChild(span);
    } else {
      const span = document.createElement("span");
      span.className = "photo-placeholder";
      span.textContent = "Aucune photo";
      tdPhoto.appendChild(span);
    }
    tr.appendChild(tdPhoto);

    tbody.appendChild(tr);
  }
}

function updateStats() {
  const statsText = $("#statsText");
  const total = allMissions.length;
  const filt = filteredMissions.length;
  statsText.textContent = `Missions : ${filt} affichées / ${total} scannées.`;
}

function openConclusionModal(mission) {
  const overlay = $("#modalOverlay");
  const content = $("#modalContent");
  content.textContent = mission.conclusion || "";
  overlay.classList.remove("hidden");
}

function closeConclusionModal() {
  $("#modalOverlay").classList.add("hidden");
}

function openPhotoModal(url) {
  const overlay = $("#photoOverlay");
  const img = $("#modalPhoto");
  img.src = url;
  overlay.classList.remove("hidden");
}

function closePhotoModal() {
  $("#photoOverlay").classList.add("hidden");
  $("#modalPhoto").src = "";
}

function exportFilteredAsCSV() {
  if (!filteredMissions.length) {
    alert("Aucune mission filtrée à exporter.");
    return;
  }
  const lines = ["num_dossier"];
  filteredMissions.forEach((m) => {
    const num = (m.numDossier || "").toString().replace(/"/g, '""');
    lines.push(`"${num}"`);
  });
  const csvContent = lines.join("\r\n");
  downloadTextFile(csvContent, "missions_filtrees.csv", "text/csv");
}

async function copyFilteredToClipboard() {
  if (!filteredMissions.length) {
    alert("Aucune mission filtrée à copier.");
    return;
  }
  const text = filteredMissions.map((m) => m.numDossier || "").join("\n");
  try {
    await navigator.clipboard.writeText(text);
    alert("Liste des numéros copiée dans le presse-papier.");
  } catch (err) {
    console.error("Erreur lors de la copie dans le presse-papier", err);
    alert("Impossible de copier dans le presse-papier dans ce navigateur.");
  }
}

function exportAllAsJSON() {
  if (!allMissions.length) {
    alert("Aucune mission à exporter.");
    return;
  }
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    missions: allMissions.map((m) => ({
      ...m,
      photoUrl: null
    }))
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  downloadTextFile(jsonStr, "missions_export.json", "application/json");
}

function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function onImportJSON(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        allMissions = data;
      } else if (data && Array.isArray(data.missions)) {
        allMissions = data.missions;
      } else {
        throw new Error("Format JSON inattendu");
      }

      allMissions.forEach((m) => {
        if (m.photoUrl) m.photoUrl = null;
      });

      filteredMissions = [...allMissions];
      populateFilterOptions();
      renderTable();
      updateStats();
      updateProgress(allMissions.length, allMissions.length, "Base JSON chargée (sans rescanner les dossiers).");
    } catch (err) {
      console.error("Erreur de lecture du JSON", err);
      alert("Erreur lors de la lecture du fichier JSON.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
}
