let alarms = [];
let activeAlarmIndex = null;
const alarmSound = document.getElementById('alarmSound');

function addMedicine() {
    const name = document.getElementById('medName').value;
    const date = document.getElementById('medDate').value;
    const time = document.getElementById('medTime').value;

    if (!name || !date || !time) {
        alert('Please fill in the medicine name, date, and time.');
        return;
    }

    // Create a target Date object for the alarm
    const alarmTime = new Date(`${date}T${time}`);

    if (alarmTime <= new Date()) {
        alert('Please select a future time for the alarm.');
        return;
    }

    alarms.push({
        name: name,
        time: alarmTime,
        isActive: true
    });

    updateUI();
    
    // Clear inputs
    document.getElementById('medName').value = '';
    document.getElementById('medTime').value = '';
}

function updateUI() {
    const list = document.getElementById('medicineList');
    list.innerHTML = '';

    alarms.forEach((alarm) => {
        if (alarm.isActive) {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <strong>${alarm.name}</strong> 
                <span>${alarm.time.toLocaleDateString()} at ${alarm.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            `;
            list.appendChild(listItem);
        }
    });
}

// Checks the time every second to see if an alarm should go off
setInterval(() => {
    const now = new Date();
    
    alarms.forEach((alarm, index) => {
        if (alarm.isActive && now >= alarm.time) {
            triggerAlarm(index);
        }
    });
}, 1000);

function triggerAlarm(index) {
    activeAlarmIndex = index;
    alarms[index].isActive = false; // Prevent it from triggering repeatedly
    
    document.getElementById('popupMedName').innerText = alarms[index].name;
    document.getElementById('alarmPopup').classList.remove('hidden');
    
    // Play the alarm sound
    alarmSound.play();
}

function stopAlarm() {
    alarmSound.pause();
    alarmSound.currentTime = 0; // Reset audio to start
    document.getElementById('alarmPopup').classList.add('hidden');
    activeAlarmIndex = null;
    updateUI();
}

function snoozeAlarm() {
    if (activeAlarmIndex !== null) {
        // Add 5 minutes (300,000 milliseconds) to the alarm time
        alarms[activeAlarmIndex].time = new Date(new Date().getTime() + 5 * 60000);
        alarms[activeAlarmIndex].isActive = true;
    }
    
    alarmSound.pause();
    alarmSound.currentTime = 0;
    document.getElementById('alarmPopup').classList.add('hidden');
    updateUI();
}
