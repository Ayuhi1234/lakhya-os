// --- 1. CONFIG & DATA ---
let schedule = JSON.parse(localStorage.getItem('lakhya_fixed_db')) || {};
let user = JSON.parse(localStorage.getItem('lakhya_fixed_user')) || { xp: 0, level: 1 };
let selectedDate = new Date().toISOString().split('T')[0];

// --- FUNNY SOUNDS ---
const SOUNDS = {
    beep: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
    boing: 'https://actions.google.com/sounds/v1/cartoon/boing_spring.ogg',
    magic: 'https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg',
    quack: 'https://actions.google.com/sounds/v1/animals/duck_quack.ogg',
    whistle: 'https://actions.google.com/sounds/v1/cartoon/slide_whistle.ogg'
};
let currentAudio = new Audio(SOUNDS.beep);

// --- 2. INIT ---
window.onload = () => {
    renderCalendarStrip();
    renderTasks();
    updateStats();
    renderYearMap();
    setInterval(checkNotifications, 60000); 
    document.getElementById('date-label').innerText = new Date().toDateString();

    // Load sound pref
    const savedSound = localStorage.getItem('lakhya_sound_pref') || 'beep';
    if(document.getElementById('sound-select')) document.getElementById('sound-select').value = savedSound;
    currentAudio = new Audio(SOUNDS[savedSound]);

    if("Notification" in window && Notification.permission === "granted") {
        if(document.getElementById('btn-notify')) {
            document.getElementById('btn-notify').classList.add('active');
            document.getElementById('btn-notify').innerText = "🔔 Active";
        }
    }
};

// --- 3. HELPER: TIME FORMATTER ---
function formatTime(hour, min) {
    if (hour === null || hour === undefined || isNaN(hour)) return "";
    const mStr = (min || 0).toString().padStart(2, '0');
    if (hour === 0) return `12:${mStr} AM`;
    if (hour === 12) return `12:${mStr} PM`;
    return hour > 12 ? `${hour - 12}:${mStr} PM` : `${hour}:${mStr} AM`;
}

// --- 4. CLOCK LOGIC (MANUAL ADD) ---
function addTask() {
    const title = document.getElementById('inp-title').value;
    const timeStr = document.getElementById('inp-time').value; 
    const cat = document.getElementById('inp-cat').value;

    if(title) {
        if(!schedule[selectedDate]) schedule[selectedDate] = [];
        
        let h = null, m = null, disp = "";
        if(timeStr) {
            const parts = timeStr.split(':');
            h = parseInt(parts[0]);
            m = parseInt(parts[1]);
            disp = formatTime(h, m);
        }

        schedule[selectedDate].push({ 
            title, desc: "Manual Task", cat, 
            alertTime: h, alertMin: m, timeDisp: disp, 
            done: false 
        });
        
        saveData(); 
        document.getElementById('modal-add').style.display='none';
        document.getElementById('inp-title').value = "";
        document.getElementById('inp-time').value = "";
        renderTasks(); renderCalendarStrip(); renderYearMap();
    }
}

// --- 5. FIXED AI PARSER (THE FIX IS HERE) ---
function parseComplexAI() {
    const text = document.getElementById('ai-input').value;
    if(!text) return;
    const lines = text.split('\n');
    let count = 0;
    const today = new Date();
    let currentParseDate = null;
    let lastTime = null;

    lines.forEach(line => {
        const l = line.trim(); const lower = l.toLowerCase();
        if (!l) return;

        // 1. Detect Day
        const dayMatch = lower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
        if (dayMatch) {
            currentParseDate = getNextDateForDay(dayMatch[0]);
            return;
        }

        // 2. Detect Time
        const timeMatch = l.match(/(\d{1,2}):(\d{2})\s?(?:–|-|to)?.*?(AM|PM|am|pm)/i);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const period = timeMatch[3].toUpperCase();
            
            if (period === 'PM' && hour < 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;
            
            const disp = formatTime(hour, minutes);
            lastTime = { h: hour, m: minutes, disp: disp };
            
            // FIX: Check if Task is on the SAME line (e.g. "4:30 AM - Polity")
            let leftover = l.replace(timeMatch[0], "").trim();
            // Remove separators like "- " or ": " or "– "
            leftover = leftover.replace(/^[-–:]\s*/, "");
            
            if(leftover.length > 2) {
                // Task found on same line! Add immediately.
                if (currentParseDate) {
                    insertTask(currentParseDate, leftover, lastTime);
                    count++;
                    lastTime = null; // Reset because we used it
                }
            }
            return;
        }

        // 3. Detect Task (On Next Line)
        if (currentParseDate && lastTime && l.length > 2) {
            insertTask(currentParseDate, l, lastTime);
            count++;
            lastTime = null;
        }
    });

    saveData();
    document.getElementById('modal-ai').style.display = 'none';
    renderCalendarStrip(); renderTasks(); renderYearMap();
    alert(`🤖 AI Scheduled ${count} tasks!`);
}

function insertTask(dateObj, titleStr, timeObj) {
    let cat = 'Skill';
    const lower = titleStr.toLowerCase();
    if (lower.includes('upsc') || lower.includes('polity')) cat = 'UPSC';
    else if (lower.includes('tech') || lower.includes('dsa') || lower.includes('code')) cat = 'Tech';
    else if (lower.includes('project')) cat = 'Project';

    let dateKey = dateObj.toISOString().split('T')[0];
    if (!schedule[dateKey]) schedule[dateKey] = [];
    
    // Remove bullets if present
    titleStr = titleStr.replace(/^[-\u2022]\s*/, "");

    schedule[dateKey].push({
        title: titleStr, desc: "AI Plan", cat: cat,
        alertTime: timeObj.h, alertMin: timeObj.m, timeDisp: timeObj.disp,
        done: false
    });
}

function getNextDateForDay(dayName) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetIdx = days.indexOf(dayName);
    const d = new Date();
    let dist = targetIdx - d.getDay();
    if (dist < 0) dist += 7;
    d.setDate(d.getDate() + dist);
    return d;
}

// --- 6. RENDER TASKS ---
function renderTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = "";
    const tasks = schedule[selectedDate] || [];
    document.getElementById('empty-state').style.display = tasks.length===0?'block':'none';

    tasks.sort((a,b) => (a.alertTime - b.alertTime) || (a.alertMin - b.alertMin));

    tasks.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = `task-card cat-${t.cat} ${t.done?'done':''}`;
        let timeDisplay = t.timeDisp || (t.alertTime !== null ? `${t.alertTime}:00` : "Anytime");

        li.innerHTML = `
            <div class="task-header">
                <div class="check-circle" onclick="toggleDone(${i})"></div>
                <div class="task-content">
                    <span class="time-badge">⏰ ${timeDisplay}</span>
                    <div class="task-title">${t.title}</div>
                    <div class="task-desc">${t.desc}</div>
                </div>
            </div>
            <div class="task-actions">
                <button class="btn-mini btn-study" onclick="studyNow('${t.title}', '${t.cat}')">⚡ Study</button>
                <button class="btn-mini btn-focus" onclick="startFocus('${t.title}')">🔥 Focus</button>
                <button class="btn-mini" onclick="deleteTask(${i})">🗑️</button>
            </div>
        `;
        list.appendChild(li);
    });
}

// --- 7. EXECUTION FEATURES ---
function studyNow(title, cat) {
    let q = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
    let url = cat === "Tech" || cat === "Project" ? `https://www.youtube.com/results?search_query=${q}` : `https://www.google.com/search?q=UPSC+${q}`;
    window.open(url, '_blank');
}

let timer = null;
function startFocus(title) {
    document.getElementById('zen-task-title').innerText = title;
    document.getElementById('zen-overlay').classList.add('active');
    let t = 25 * 60;
    timer = setInterval(() => {
        t--; 
        let m = Math.floor(t/60); let s = t%60;
        document.getElementById('zen-timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
        if(t<=0) stopFocus();
    }, 1000);
}
function stopFocus() { clearInterval(timer); document.getElementById('zen-overlay').classList.remove('active'); }

// --- 8. SOUND & NOTIFICATIONS ---
function changeSound() {
    const selected = document.getElementById('sound-select').value;
    currentAudio = new Audio(SOUNDS[selected]);
    localStorage.setItem('lakhya_sound_pref', selected);
    currentAudio.play();
}

function activateAudio() {
    currentAudio.play().then(() => {
        currentAudio.pause(); currentAudio.currentTime = 0;
        if("Notification" in window) Notification.requestPermission();
        document.getElementById('btn-notify').classList.add('active');
        document.getElementById('btn-notify').innerText = "🔔 Active";
        alert("Sound Enabled!");
    });
}

function checkNotifications() {
    const now = new Date();
    const tasks = schedule[now.toISOString().split('T')[0]] || [];
    tasks.forEach(t => {
        if(!t.done && t.alertTime === now.getHours()) {
            let targetMin = t.alertMin || 0;
            if(now.getMinutes() === targetMin) {
                currentAudio.play();
                if(Notification.permission==="granted") new Notification("Lakhya: "+t.title);
            }
        }
    });
}

// --- 9. VISUALIZATIONS ---
function renderYearMap() {
    const container = document.getElementById('year-grid-container');
    container.innerHTML = "";
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for(let m = 0; m < 12; m++) {
        const monthDiv = document.createElement('div'); monthDiv.className = 'month-box';
        monthDiv.innerHTML = `<div class="month-title">${months[m]}</div>`;
        const grid = document.createElement('div'); grid.className = 'days-grid';
        const daysInMonth = new Date(2026, m + 1, 0).getDate();
        for(let d = 1; d <= daysInMonth; d++) {
            let key = `2026-${(m+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
            const dot = document.createElement('div'); dot.className = 'day-dot';
            if(schedule[key] && schedule[key].some(t=>t.done)) dot.classList.add('active');
            grid.appendChild(dot);
        }
        monthDiv.appendChild(grid); container.appendChild(monthDiv);
    }
}

function renderCalendarStrip() {
    const strip = document.getElementById('calendar-strip');
    strip.innerHTML = "";
    const today = new Date();
    for(let i=0; i<14; i++) {
        let d = new Date(); d.setDate(today.getDate() + i);
        let key = d.toISOString().split('T')[0];
        let hasTasks = schedule[key] && schedule[key].length > 0 ? 'has-tasks' : '';
        let isActive = key === selectedDate ? 'active' : '';
        let div = document.createElement('div');
        div.className = `date-card ${isActive} ${hasTasks}`;
        div.innerHTML = `<span class="day-name">${d.toLocaleDateString('en-US',{weekday:'short'})}</span><span class="day-num">${d.getDate()}</span><div class="dot"></div>`;
        div.onclick = () => { selectedDate = key; renderCalendarStrip(); renderTasks(); };
        strip.appendChild(div);
    }
}

// --- 10. UTILS ---
function toggleDone(i) {
    schedule[selectedDate][i].done = !schedule[selectedDate][i].done;
    if(schedule[selectedDate][i].done) user.xp+=20;
    saveData(); renderTasks(); renderYearMap(); updateStats();
}
function deleteTask(i) { schedule[selectedDate].splice(i, 1); saveData(); renderTasks(); renderCalendarStrip(); renderYearMap(); }

function updateStats() {
    document.getElementById('level-display').innerText = "Lvl " + Math.floor(user.xp/100 + 1);
    document.getElementById('xp-text').innerText = user.xp + " XP";
    document.getElementById('xp-fill').style.width = (user.xp%100) + "%";
}
function switchView(id, btn) {
    document.querySelectorAll('.section').forEach(e=>e.style.display='none');
    document.getElementById('view-'+id).style.display='block';
    document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
    btn.classList.add('active');
    if(id==='year') renderYearMap();
}
function saveData() { 
    localStorage.setItem('lakhya_fixed_db', JSON.stringify(schedule)); 
    localStorage.setItem('lakhya_fixed_user', JSON.stringify(user)); 
}

// Timer
function toggleTimer() {
    if(timer) stopFocus(); else startFocus("Manual Session");
}
