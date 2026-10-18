
const $ = (id) => document.getElementById(id);

const medicineForm = $("medicineForm");
const medicineList = $("medicineList");
const emptyMedicines = $("emptyMedicines");
const showMedicineForm = $("showMedicineForm");

const STORAGE_KEYS = {
    medicines: "carecompanion_medicines_v1",
    readings: "carecompanion_readings_v1",
    doseHistory: "carecompanion_dose_history_v1"
};

function loadData(key, fallback = []) {
    try {
        const saved = localStorage.getItem(key);
        const parsed = saved ? JSON.parse(saved) : fallback;
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function saveData(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        alert("Your browser could not save this information. Check browser storage settings.");
        return false;
    }
}

let medicines = loadData(STORAGE_KEYS.medicines);
let readings = loadData(STORAGE_KEYS.readings);
let doseHistory = loadData(STORAGE_KEYS.doseHistory);

let activeReminderId = null;
let snoozedUntil = {};
let audioContext = null;
let audioEnabled = false;
const alertedOccurrences = new Set();

function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function formatTime(time) {
    if (!/^\d{2}:\d{2}$/.test(time || "")) return "--:--";

    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function doseTaken(medicineId, date = todayKey()) {
    return doseHistory.some(entry =>
        entry.medicineId === medicineId && entry.date === date
    );
}

function updateDoseHistory(medicineId, taken) {
    const date = todayKey();

    doseHistory = doseHistory.filter(entry =>
        !(entry.medicineId === medicineId && entry.date === date)
    );

    if (taken) {
        doseHistory.push({
            medicineId,
            date,
            recordedAt: new Date().toISOString()
        });
    }

    saveData(STORAGE_KEYS.doseHistory, doseHistory);
}

function renderDashboard() {
    const now = new Date();

    $("todayDate").textContent = now.toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric"
    });

    $("totalMedicines").textContent = medicines.length;

    const takenCount = medicines.filter(medicine =>
        doseTaken(medicine.id)
    ).length;

    $("takenMedicines").textContent = takenCount;

    const upcoming = medicines
        .filter(medicine =>
            !doseTaken(medicine.id) &&
            medicine.time >= now.toTimeString().slice(0, 5)
        )
        .sort((a, b) => a.time.localeCompare(b.time));

    if (upcoming.length) {
        $("nextReminder").textContent = formatTime(upcoming[0].time);
        $("nextMedicine").textContent = upcoming[0].name;
    } else {
        $("nextReminder").textContent = "--:--";
        $("nextMedicine").textContent =
            medicines.length ? "No more pending times today" : "Add your first reminder";
    }
}

function renderMedicines() {
    medicineList.innerHTML = "";
    emptyMedicines.hidden = medicines.length > 0;

    medicines.sort((a, b) => a.time.localeCompare(b.time));

    medicines.forEach(medicine => {
        const taken = doseTaken(medicine.id);
        const item = document.createElement("article");

        item.className = `medicine-item${taken ? " is-taken" : ""}`;

        const symbol = medicine.type === "Syrup" ? "🧴" :
            medicine.type === "Capsule" ? "💊" :
            medicine.type === "Tablet" ? "💊" : "🩺";

        item.innerHTML = `
            <div class="medicine-symbol" aria-hidden="true">${symbol}</div>
            <div class="medicine-details">
                <h3>${escapeHTML(medicine.name)}</h3>
                <p>${escapeHTML(medicine.type)}</p>
                ${medicine.instructions
                    ? `<p>${escapeHTML(medicine.instructions)}</p>`
                    : ""}
                <p class="medicine-time">⏰ ${formatTime(medicine.time)}</p>
                <div class="medicine-actions">
                    <button type="button" class="taken-button"
                        data-action="taken" data-id="${escapeHTML(medicine.id)}"
                        aria-pressed="${taken}">
                        ${taken ? "✓ Taken today" : "Mark as taken"}
                    </button>
                    <button type="button" data-action="edit"
                        data-id="${escapeHTML(medicine.id)}">Edit</button>
                    <button type="button" class="delete-button"
                        data-action="delete" data-id="${escapeHTML(medicine.id)}">
                        Delete
                    </button>
                </div>
            </div>
        `;

        medicineList.appendChild(item);
    });

    renderDashboard();
}

function openMedicineForm() {
    medicineForm.hidden = false;
    showMedicineForm.hidden = true;
    $("medicineName").focus();
}

function closeMedicineForm() {
    medicineForm.reset();
    $("medicineId").value = "";
    medicineForm.hidden = true;
    showMedicineForm.hidden = false;
}

showMedicineForm.addEventListener("click", openMedicineForm);

$("cancelMedicineForm").addEventListener("click", closeMedicineForm);

medicineForm.addEventListener("submit", event => {
    event.preventDefault();

    const id = $("medicineId")?.value;
    const name = $("medicineName").value.trim();
    const type = $("medicineType").value;
    const instructions = $("medicineInstructions").value.trim();
    const time = $("medicineTime").value;

    if (!name || !time) {
        alert("Please enter a medicine name and reminder time.");
        return;
    }

    const existing = medicines.find(medicine => medicine.id === id);

    if (existing) {
        existing.name = name;
        existing.type = type;
        existing.instructions = instructions;
        existing.time = time;
    } else {
        medicines.push({
            id: crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`,
            name,
            type,
            instructions,
            time
        });
    }

    if (saveData(STORAGE_KEYS.medicines, medicines)) {
        closeMedicineForm();
        renderMedicines();
    }
});

medicineList.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const medicine = medicines.find(item => item.id === button.dataset.id);
    if (!medicine) return;

    const action = button.dataset.action;

    if (action === "taken") {
        updateDoseHistory(medicine.id, !doseTaken(medicine.id));
        renderMedicines();
    }

    if (action === "delete") {
        if (!confirm(`Delete the reminder for ${medicine.name}?`)) return;

        medicines = medicines.filter(item => item.id !== medicine.id);
        doseHistory = doseHistory.filter(entry =>
            entry.medicineId !== medicine.id
        );

        saveData(STORAGE_KEYS.medicines, medicines);
        saveData(STORAGE_KEYS.doseHistory, doseHistory);
        renderMedicines();
    }

    if (action === "edit") {
        if (!$("medicineId")) {
            const hiddenInput = document.createElement("input");
            hiddenInput.type = "hidden";
            hiddenInput.id = "medicineId";
            medicineForm.prepend(hiddenInput);
        }

        $("medicineId").value = medicine.id;
        $("medicineName").value = medicine.name;
        $("medicineType").value = medicine.type;
        $("medicineInstructions").value = medicine.instructions || "";
        $("medicineTime").value = medicine.time;

        openMedicineForm();
    }
});

/* Health readings */

function renderReadings() {
    const container = $("healthReadings");

    if (!readings.length) {
        container.innerHTML =
            '<p class="muted-text">No readings recorded yet.</p>';
        return;
    }

    container.innerHTML = "";

    [...readings].reverse().slice(0, 10).forEach(reading => {
        const item = document.createElement("article");
        item.className = "reading-item";

        item.innerHTML = `
            <strong>${escapeHTML(reading.type)}: ${escapeHTML(reading.value)}</strong>
            <p>${formatDateTime(reading.timestamp)}</p>
            <button type="button" class="secondary-button"
                data-delete-reading="${escapeHTML(reading.id)}">
                Delete reading
            </button>
        `;

        container.appendChild(item);
    });
}

$("healthForm").addEventListener("submit", event => {
    event.preventDefault();

    const type = $("healthType").value;
    const value = $("healthValue").value.trim();

    if (!value) {
        alert("Please enter a reading.");
        return;
    }

    if (value.length > 30) {
        alert("Please enter a shorter reading.");
        return;
    }

    readings.push({
        id: `${Date.now()}-${Math.random()}`,
        type,
        value,
        timestamp: new Date().toISOString()
    });

    if (saveData(STORAGE_KEYS.readings, readings)) {
        $("healthValue").value = "";
        renderReadings();
    }
});

$("healthReadings").addEventListener("click", event => {
    const button = event.target.closest("[data-delete-reading]");
    if (!button) return;

    if (!confirm("Delete this health reading?")) return;

    readings = readings.filter(reading =>
        reading.id !== button.dataset.deleteReading
    );

    saveData(STORAGE_KEYS.readings, readings);
    renderReadings();
});

/* Reminder alerts and optional sound */

function enableReminderSound() {
    const AudioContextClass = window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioContextClass) {
        alert("Sound alerts are not supported by this browser.");
        return;
    }

    audioContext = audioContext || new AudioContextClass();

    audioContext.resume().then(() => {
        audioEnabled = true;
        alert("Sound alerts enabled while this page is active.");
    }).catch(() => {
        alert("Could not enable sound. Check your browser permissions.");
    });
}

function playAlertSound() {
    if (!audioEnabled || !audioContext) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.value = 0.12;

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();

        setTimeout(() => {
            try {
                oscillator.stop();
                oscillator.disconnect();
                gain.disconnect();
            } catch {}
        }, 500);
    } catch {}
}

function openReminder(medicine, occurrenceKey) {
    activeReminderId = medicine.id;
    $("reminderTitle").textContent = "Medicine reminder";
    $("reminderMessage").textContent =
        `Your scheduled reminder is for ${medicine.name} (${medicine.type}) at ${formatTime(medicine.time)}. Follow your prescribed instructions.`;
    $("reminderDialog").hidden = false;

    alertedOccurrences.add(occurrenceKey);
    playAlertSound();

    if ("Notification" in window &&
        Notification.permission === "granted") {
        try {
            new Notification("CareCompanion reminder", {
                body: `Check your scheduled reminder for ${medicine.name}.`
            });
        } catch {}
    }
}

function checkReminders() {
    const now = new Date();
    const date = todayKey();
    const currentTime = now.toTimeString().slice(0, 5);

    medicines.forEach(medicine => {
        const occurrenceKey = `${date}-${medicine.id}-${medicine.time}`;

        if (medicine.time !== currentTime) return;
        if (doseTaken(medicine.id, date)) return;
        if (alertedOccurrences.has(occurrenceKey)) return;

        const snoozeTime = snoozedUntil[occurrenceKey];

        if (snoozeTime && Date.now() < snoozeTime) return;

        openReminder(medicine, occurrenceKey);
    });
}

function closeReminder() {
    $("reminderDialog").hidden = true;
    activeReminderId = null;
}

$("reminderTaken").addEventListener("click", () => {
    if (activeReminderId) {
        updateDoseHistory(activeReminderId, true);
        renderMedicines();
    }
    closeReminder();
});

$("reminderDismiss").addEventListener("click", closeReminder);

$("reminderSnooze").addEventListener("click", () => {
    if (activeReminderId) {
        const medicine = medicines.find(item => item.id === activeReminderId);

        if (medicine) {
            const key = `${todayKey()}-${medicine.id}-${medicine.time}`;
            snoozedUntil[key] = Date.now() + 5 * 60 * 1000;

            setTimeout(() => {
                if (medicines.some(item => item.id === medicine.id) &&
                    !doseTaken(medicine.id)) {
                    openReminder(medicine, key);
                }
            }, 5 * 60 * 1000);
        }
    }

    closeReminder();
});

/* Ask for notification permission only after a user action */

const notificationButton = document.createElement("button");
notificationButton.type = "button";
notificationButton.className = "secondary-button";
notificationButton.textContent = "Enable reminder sound";
notificationButton.style.marginTop = "12px";

notificationButton.addEventListener("click", async () => {
    enableReminderSound();

    if ("Notification" in window &&
        Notification.permission === "default") {
        try {
            await Notification.requestPermission();
        } catch {}
    }
});

document.querySelector(".alert-banner > div").appendChild(notificationButton);

/* Initialize dashboard */

renderMedicines();
renderReadings();

checkReminders();
setInterval(checkReminders, 15000);
