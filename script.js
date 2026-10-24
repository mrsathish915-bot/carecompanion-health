
"use strict";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "carecompanion_professional_v2";
const SNOOZE_MS = 5 * 60 * 1000;

let data = loadData();
let selectedProfileId = data.profiles[0]?.id || null;
let alarmContext = null;
let audioContext = null;
let alarmTimer = null;
let soundEnabled = false;
let lastStatusTimer = null;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.profiles)) {
      return {
        profiles: saved.profiles,
        medicines: Array.isArray(saved.medicines) ? saved.medicines : [],
        readings: Array.isArray(saved.readings) ? saved.readings : [],
        history: Array.isArray(saved.history) ? saved.history : [],
        fired: saved.fired || {},
        snoozes: saved.snoozes || {}
      };
    }
  } catch (error) {
    console.error("Could not load saved data:", error);
  }
  return {
    profiles: [],
    medicines: [],
    readings: [],
    history: [],
    fired: {},
    snoozes: {}
  };
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    showStatus("Could not save data. Check your browser storage.");
    console.error(error);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showStatus(message) {
  $("statusMessage").textContent = message;
  clearTimeout(lastStatusTimer);
  lastStatusTimer = setTimeout(() => {
    $("statusMessage").textContent = "";
  }, 3500);
}

function selectedProfile() {
  return data.profiles.find((profile) => profile.id === selectedProfileId);
}

function memberMedicines() {
  return data.medicines.filter((medicine) => medicine.profileId === selectedProfileId);
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeLabel(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function doseKey(medicine, day = dateKey()) {
  return `${day}_${medicine.id}`;
}

function doseTaken(medicine) {
  return data.history.some((item) =>
    item.profileId === selectedProfileId &&
    item.medicineId === medicine.id &&
    item.day === dateKey() &&
    item.action === "taken"
  );
}

/* Sound must first be enabled by a real user click. */
async function enableSound() {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      showStatus("This browser does not support alarm audio.");
      return;
    }

    if (!audioContext) audioContext = new AudioCtor();
    if (audioContext.state === "suspended") await audioContext.resume();

    if (audioContext.state !== "running") {
      showStatus("Audio is blocked. Check browser sound permissions.");
      return;
    }

    soundEnabled = true;
    $("enableSound").textContent = "🔔 Alarm Sound Enabled";
    $("enableSound").classList.add("sound-on");
    playChime();
    showStatus("Alarm sound enabled. Keep this page open for reminders.");
  } catch (error) {
    console.error(error);
    showStatus("Could not enable sound. Check browser permissions.");
  }
}

function playChime() {
  if (!audioContext || audioContext.state !== "running") return;

  const now = audioContext.currentTime;
  [880, 1175].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
    gain.gain.setValueAtTime(0.12, now + 0.20);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + index * 0.14);
    oscillator.stop(now + 0.34 + index * 0.14);
  });
}

function startAlarmSound() {
  stopAlarmSound();
  if (!soundEnabled || !audioContext) {
    showStatus("Reminder opened. Click Enable Alarm Sound to allow audio.");
    return;
  }
  playChime();
  alarmTimer = setInterval(playChime, 850);
}

function stopAlarmSound() {
  if (alarmTimer !== null) clearInterval(alarmTimer);
  alarmTimer = null;
}

function addHistory(medicine, action) {
  data.history.unshift({
    id: uid(),
    profileId: medicine.profileId,
    medicineId: medicine.id,
    medicineName: medicine.name,
    action,
    day: dateKey(),
    time: new Date().toISOString()
  });
  data.history = data.history.slice(0, 300);
  saveData();
}

function showAlarm(medicine, isSnooze = false) {
  if (alarmContext) return;

  const profile = data.profiles.find((item) => item.id === medicine.profileId);
  if (!profile) return;

  alarmContext = {
    medicineId: medicine.id,
    profileId: medicine.profileId,
    day: dateKey(),
    snooze: isSnooze
  };

  $("reminderTitle").textContent = `Time for ${escapeHTML(medicine.name)}`;
  $("reminderMessage").textContent =
    `${profile.name}: ${medicine.name} (${medicine.type}), scheduled for ${timeLabel(medicine.time)}.` +
    (medicine.instructions ? ` Instructions: ${medicine.instructions}.` : "");

  const dialog = $("reminderDialog");
  if (!dialog.open) dialog.showModal();
  startAlarmSound();
}

function closeAlarm() {
  stopAlarmSound();
  if ($("reminderDialog").open) $("reminderDialog").close();
  alarmContext = null;
}

function stopAlarm() {
  if (!alarmContext) {
    closeAlarm();
    return;
  }

  const context = alarmContext;
  const medicine = data.medicines.find((item) => item.id === context.medicineId);

  if (medicine) {
    data.fired[doseKey(medicine, context.day)] = true;
    saveData();
  }

  closeAlarm();
  showStatus("Alarm stopped. The dose was not marked as taken.");
}

function markTaken() {
  if (!alarmContext) return;

  const context = alarmContext;
  const medicine = data.medicines.find((item) => item.id === context.medicineId);

  if (medicine) {
    data.fired[doseKey(medicine, context.day)] = true;
    addHistory(medicine, "taken");
  }

  closeAlarm();
  renderAll();
  showStatus("Dose marked as taken.");
}

function snoozeAlarm() {
  if (!alarmContext) return;

  const context = alarmContext;
  const medicine = data.medicines.find((item) => item.id === context.medicineId);

  if (medicine) {
    data.snoozes[doseKey(medicine, context.day)] = Date.now() + SNOOZE_MS;
    saveData();
    addHistory(medicine, "snoozed");
  }

  closeAlarm();
  showStatus("Alarm snoozed for 5 minutes.");
}

function checkReminders() {
  if (alarmContext || !data.profiles.length) return;

  const now = new Date();
  const today = dateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const medicine of data.medicines) {
    if (doseTakenFor(medicine, today)) continue;

    const key = doseKey(medicine, today);
    const snoozeAt = data.snoozes[key];

    if (snoozeAt && Date.now() >= snoozeAt) {
      delete data.snoozes[key];
      saveData();
      showAlarm(medicine, true);
      return;
    }

    if (data.fired[key]) continue;
    if (!medicine.time) continue;

    const [hours, minutes] = medicine.time.split(":").map(Number);
    const scheduledMinutes = hours * 60 + minutes;

    if (currentMinutes >= scheduledMinutes) {
      data.fired[key] = true;
      saveData();
      showAlarm(medicine);
      return;
    }
  }
}

function doseTakenFor(medicine, day) {
  return data.history.some((item) =>
    item.profileId === medicine.profileId &&
    item.medicineId === medicine.id &&
    item.day === day &&
    item.action === "taken"
  );
}

function renderProfiles() {
  const list = $("profileList");

  if (!data.profiles.length) {
    list.innerHTML = '<p class="empty-state">Add your first family profile above.</p>';
    return;
  }

  list.innerHTML = data.profiles.map((profile) => `
    <article class="profile-card ${profile.id === selectedProfileId ? "selected" : ""}">
      <button type="button" class="profile-select" data-select-profile="${escapeHTML(profile.id)}">
        <span class="avatar">${escapeHTML(profile.name.trim().charAt(0).toUpperCase())}</span>
        <span class="profile-name">${escapeHTML(profile.name)}</span>
        <span class="profile-meta">
          ${profile.age ? `${escapeHTML(profile.age)} years · ` : ""}
          ${escapeHTML(profile.relation || "Family member")}
        </span>
      </button>
      <button type="button" class="danger-button profile-delete"
        data-delete-profile="${escapeHTML(profile.id)}">Remove profile</button>
    </article>
  `).join("");
}

function renderMedicines() {
  const list = $("medicineList");
  const medicines = memberMedicines().sort((a, b) => a.time.localeCompare(b.time));

  $("emptyMedicines").hidden = medicines.length > 0;
  list.innerHTML = medicines.map((medicine) => `
    <article class="medicine-card">
      <div>
        <div class="medicine-name">💊 ${escapeHTML(medicine.name)}</div>
        <div class="medicine-meta">${escapeHTML(medicine.type)}</div>
        <span class="medicine-time">${escapeHTML(timeLabel(medicine.time))}</span>
        ${medicine.instructions ? `<div class="medicine-meta">${escapeHTML(medicine.instructions)}</div>` : ""}
        <div class="medicine-meta">${doseTaken(medicine) ? "✓ Taken today" : "○ Not marked taken today"}</div>
      </div>
      <div class="medicine-actions">
        <button type="button" class="small-button" data-taken="${escapeHTML(medicine.id)}">✓ Taken</button>
        <button type="button" class="small-button" data-edit="${escapeHTML(medicine.id)}">Edit</button>
        <button type="button" class="danger-button" data-delete="${escapeHTML(medicine.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderReadings() {
  const readings = data.readings.filter((item) => item.profileId === selectedProfileId);
  $("healthReadings").innerHTML = readings.slice(0, 20).map((reading) => `
    <article class="reading-item">
      <div>
        <strong>${escapeHTML(reading.type)}: ${escapeHTML(reading.value)}</strong>
        <div class="reading-meta">${escapeHTML(new Date(reading.time).toLocaleString())}</div>
      </div>
      <button class="danger-button" type="button" data-delete-reading="${escapeHTML(reading.id)}">Delete</button>
    </article>
  `).join("") || '<p class="hint">No readings saved for this profile yet.</p>';
}

function renderHistory() {
  const history = data.history.filter((item) => item.profileId === selectedProfileId);
  $("doseHistory").innerHTML = history.slice(0, 20).map((item) => `
    <article class="reading-item">
      <div>
        <strong>${escapeHTML(item.medicineName)}</strong>
        <div class="reading-meta">${escapeHTML(item.action)} · ${escapeHTML(new Date(item.time).toLocaleString())}</div>
      </div>
    </article>
  `).join("") || '<p class="hint">No dose activity recorded yet.</p>';
}

function renderAll() {
  renderProfiles();
  const profile = selectedProfile();

  $("selectedPerson").textContent = profile
    ? `Managing care for ${profile.name}`
    : "Add a family member to get started.";

  $("showMedicineForm").disabled = !profile;
  $("healthForm").querySelector("button[type=submit]").disabled = !profile;

  const medicines = memberMedicines();
  $("totalMedicines").textContent = medicines.length;
  $("pendingMedicines").textContent = medicines.filter((medicine) => !doseTaken(medicine)).length;
  $("takenMedicines").textContent = medicines.filter(doseTaken).length;

  renderMedicines();
  renderReadings();
  renderHistory();
}

function resetMedicineForm() {
  $("medicineForm").reset();
  $("medicineId").value = "";
  $("medicineFormTitle").textContent = "Add a medicine";
  $("medicineForm").hidden = true;
}

$("enableSound").addEventListener("click", enableSound);

$("profileForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("profileName").value.trim();
  if (!name) return;

  const profile = {
    id: uid(),
    name,
    age: $("profileAge").value,
    relation: $("profileRelation").value
  };

  data.profiles.push(profile);
  selectedProfileId = profile.id;
  saveData();
  $("profileForm").reset();
  renderAll();
  showStatus("Family profile added.");
});

$("profileList").addEventListener("click", (event) => {
  const selectButton = event.target.closest("[data-select-profile]");
  const deleteButton = event.target.closest("[data-delete-profile]");

  if (selectButton) {
    selectedProfileId = selectButton.dataset.selectProfile;
    resetMedicineForm();
    renderAll();
  }

  if (deleteButton) {
    const id = deleteButton.dataset.deleteProfile;
    const profile = data.profiles.find((item) => item.id === id);
    if (!profile) return;

    if (!confirm(`Remove ${profile.name} and all their saved medicines, readings and history from this browser?`)) return;

    data.profiles = data.profiles.filter((item) => item.id !== id);
    data.medicines = data.medicines.filter((item) => item.profileId !== id);
    data.readings = data.readings.filter((item) => item.profileId !== id);
    data.history = data.history.filter((item) => item.profileId !== id);

    if (alarmContext?.profileId === id) closeAlarm();
    if (selectedProfileId === id) selectedProfileId = data.profiles[0]?.id || null;

    saveData();
    renderAll();
    showStatus("Profile removed.");
  }
});

$("showMedicineForm").addEventListener("click", () => {
  if (!selectedProfile()) {
    showStatus("Add or select a family profile first.");
    return;
  }
  resetMedicineForm();
  $("medicineForm").hidden = false;
  $("medicineName").focus();
});

$("cancelMedicine").addEventListener("click", resetMedicineForm);

$("medicineForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const profile = selectedProfile();
  if (!profile) {
    showStatus("Please add a family profile first.");
    return;
  }

  const id = $("medicineId").value;
  const existing = data.medicines.find((item) =>
    item.id === id && item.profileId === selectedProfileId
  );

  const medicine = {
    id: existing?.id || uid(),
    profileId: selectedProfileId,
    name: $("medicineName").value.trim(),
    type: $("medicineType").value,
    time: $("medicineTime").value,
    instructions: $("medicineInstructions").value.trim()
  };

  if (!medicine.name || !medicine.time) {
    showStatus("Enter a medicine name and reminder time.");
    return;
  }

  if (existing) {
    Object.assign(existing, medicine);
  } else {
    data.medicines.push(medicine);
  }

  saveData();
  resetMedicineForm();
  renderAll();
  showStatus(existing ? "Medicine updated." : "Medicine added.");
});

$("medicineList").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  const takenButton = event.target.closest("[data-taken]");

  if (editButton) {
    const medicine = memberMedicines().find((item) => item.id === editButton.dataset.edit);
    if (!medicine) return;

    $("medicineId").value = medicine.id;
    $("medicineName").value = medicine.name;
    $("medicineType").value = medicine.type;
    $("medicineTime").value = medicine.time;
    $("medicineInstructions").value = medicine.instructions || "";
    $("medicineFormTitle").textContent = "Edit medicine";
    $("medicineForm").hidden = false;
    $("medicineForm").scrollIntoView({ behavior: "smooth", block: "center" });
    $("medicineName").focus();
  }

  if (deleteButton) {
    const medicine = memberMedicines().find((item) => item.id === deleteButton.dataset.delete);
    if (!medicine) return;
    if (!confirm(`Delete ${medicine.name}?`)) return;

    data.medicines = data.medicines.filter((item) => item.id !== medicine.id);
    if (alarmContext?.medicineId === medicine.id) closeAlarm();
    saveData();
    renderAll();
    showStatus("Medicine deleted.");
  }

  if (takenButton) {
    const medicine = memberMedicines().find((item) => item.id === takenButton.dataset.taken);
    if (!medicine) return;
    if (doseTaken(medicine)) {
      showStatus("This medicine is already marked taken today.");
      return;
    }
    data.fired[doseKey(medicine)] = true;
    addHistory(medicine, "taken");
    renderAll();
    showStatus("Dose marked as taken.");
  }
});

$("healthForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selectedProfile()) {
    showStatus("Add a family profile first.");
    return;
  }

  data.readings.unshift({
    id: uid(),
    profileId: selectedProfileId,
    type: $("healthType").value,
    value: $("healthValue").value.trim(),
    time: new Date().toISOString()
  });

  data.readings = data.readings.slice(0, 300);
  saveData();
  $("healthValue").value = "";
  renderReadings();
  showStatus("Health reading saved.");
});

$("healthReadings").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-reading]");
  if (!button) return;
  if (!confirm("Delete this health reading?")) return;

  data.readings = data.readings.filter((item) => item.id !== button.dataset.deleteReading);
  saveData();
  renderReadings();
  showStatus("Reading deleted.");
});

$("stopAlarm").addEventListener("click", stopAlarm);
$("takenAlarm").addEventListener("click", markTaken);
$("snoozeAlarm").addEventListener("click", snoozeAlarm);

/* Keep the alarm dialog open unless the user chooses an action. */
$("reminderDialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  showStatus("Use Stop Alarm or Snooze to close this reminder.");
});

/* Recover safely if the dialog is closed by browser UI. */
$("reminderDialog").addEventListener("close", () => {
  if (alarmContext) {
    stopAlarmSound();
    alarmContext = null;
  }
});

renderAll();
setInterval(checkReminders, 1000);
checkReminders();
