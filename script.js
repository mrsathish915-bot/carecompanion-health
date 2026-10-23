let alarms = JSON.parse(localStorage.getItem('care_alarms')) || [];
let currentProfile = 'Person 1';
let activeAlarmId = null;
const alarmSound = document.getElementById('alarmSound');

function saveToLocal() {
    localStorage.setItem('care_alarms', JSON.stringify(alarms));
}

function setProfile(profile, btnElement) {
    currentProfile = profile;
    
    // Update active tab styling
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    
    updateUI();
}

function addMedicine() {
    const name = document.getElementById('medName').value;
    const type = document.getElementById('medType').value;
    const info = document.getElementById('medInfo').value;
    const date = document.getElementById('medDate').value;
    const time = document.getElementById('medTime').value;

    if (!name || !date || !time) {
        alert('Please enter Name, Date, and Time!');
        return;
    }

    const newAlarm = {
        id: Date.now(),
        profile: currentProfile,
        name: name,
        type: type,
        info: info,
        date: date,
        time: time,
        isTaken: false
    };

    alarms.push(newAlarm);
    saveToLocal();
    updateUI();
    
    // Clear form
    document.getElementById('medName').value = '';
    document.getElementById('medInfo').value = '';
    document.getElementById('medTime').value = '';
}

function deleteMedicine(id) {
    if(confirm("Are you sure you want to delete this reminder?")) {
        alarms = alarms.filter(alarm => alarm.id !== id);
        saveToLocal();
        updateUI();
    }
}

function editMedicine(id) {
    const alarmToEdit = alarms.find(a => a.id === id);
    if(alarmToEdit) {
        document.getElementById('medName').value = alarmToEdit.name;
        document.getElementById('medType').value = alarmToEdit.type;
        document.getElementById('medInfo').value = alarmToEdit.info;
        document.getElementById('medDate').value = alarmToEdit.date;
        document.getElementById('medTime').value = alarmToEdit.time;
        
        // Remove the old one, user will save it as new
        alarms = alarms.filter(alarm => alarm.id !== id);
        saveToLocal();
        updateUI();
    }
}

function toggleTaken(id) {
    const alarm = alarms.find(a => a.id === id);
    if(alarm) {
        alarm.isTaken = !alarm.isTaken;
        saveToLocal();
        updateUI();
    }
}

function updateUI() {
    const list = document.getElementById('medicineList');
    list.innerHTML = '';

    // Show only the current profile's alarms
    const profileAlarms = alarms.filter(a => a.profile === currentProfile);

    profileAlarms.forEach((alarm) => {
        const li = document.createElement('li');
        li.className = `medicine-item ${alarm.isTaken ? 'taken' : ''}`;
        
        // Format display time
        const timeString = new Date(`${alarm.date}T${alarm.time}`).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dateString = new Date(alarm.date).toLocaleDateString();

        li.innerHTML = `
            <div class="med-header">
                <h3>${alarm.type} ${alarm.name}</h3>
                <strong>⏰ ${timeString} (${dateString})</strong>
            </div>
            <p class="med-details">ℹ️ ${alarm.info || 'No extra details'}</p>
            <div class="action-btns">
                <button class="btn-taken" onclick="toggleTaken(${alarm.id})">
                    ${alarm.isTaken ? 'Undo' : '✔ Mark Taken'}
                </button>
                <button class="btn-edit" onclick="editMedicine(${alarm.id})">✏ Edit</button>
                <button class="btn-delete" onclick="deleteMedicine(${alarm.id})">🗑 Delete</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// Alarm Checker (runs every second)
setInterval(() => {
    const now = new Date();
    
    alarms.forEach((alarm) => {
        if (!alarm.isTaken) {
            const alarmTime = new Date(`${alarm.date}T${alarm.time}`);
            
            // Trigger if time matches (within a 1 minute window to avoid multiple popups)
            if (now.getHours() === alarmTime.getHours() && 
                now.getMinutes() === alarmTime.getMinutes() &&
                now.getDate() === alarmTime.getDate() &&
                activeAlarmId !== alarm.id) { // Prevent repeating if already ringing
                
                triggerAlarm(alarm);
            }
        }
    });
}, 1000);

function triggerAlarm(alarm) {
    activeAlarmId = alarm.id;
    
    document.getElementById('popupUser').innerText = `For: ${alarm.profile}`;
    document.getElementById('popupMedName').innerText = `${alarm.type} ${alarm.name}`;
    document.getElementById('popupMedInfo').innerText = `Instructions: ${alarm.info || 'None'}`;
    
    document.getElementById('alarmPopup').classList.remove('hidden');
    alarmSound.play();
}

function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0; 
    document.getElementById('alarmPopup').classList.add('hidden');
    
    // Mark as taken automatically when stopped
    if(activeAlarmId) {
        toggleTaken(activeAlarmId);
    }
    activeAlarmId = null;
}

function snoozeAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0;
    document.getElementById('alarmPopup').classList.add('hidden');
    
    if (activeAlarmId) {
        const alarm = alarms.find(a => a.id === activeAlarmId);
        if (alarm) {
            // Add 5 minutes
            const newTime = new Date(new Date().getTime() + 5 * 60000);
            alarm.time = newTime.toTimeString().slice(0, 5); // Format back to HH:MM
            alarm.date = newTime.toISOString().split('T')[0]; // Format back to YYYY-MM-DD
            saveToLocal();
            updateUI();
        }
    }
    activeAlarmId = null;
}

// Initial load
updateUI();
