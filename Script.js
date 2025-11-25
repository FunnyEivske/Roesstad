import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// --- INIT ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- VARIABLER ---
let currentUser = null;
let people = [];
let focusPersonId = null;
let currentScale = 1.0;
let modalAction = null;
let modalMode = 'new';
let mapInstance = null; // Leaflet map

// --- SIKKERHETSSJEKK (Kjøres med en gang) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        startDataListener();
    } else {
        window.location.href = "index.html";
    }
});

// Logg ut knapp
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        });
    });
}

// --- DATABASE LYTTER ---
function startDataListener() {
    const q = query(collection(db, 'familyMembers'));

    onSnapshot(q, (snapshot) => {
        people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (!focusPersonId && people.length > 0) {
            const me = people.find(p => p.name && (p.name.toLowerCase().includes('eivind') || p.name.toLowerCase() === 'meg'));
            focusPersonId = me ? me.id : people[0].id;
        }

        // Oppdater alle visninger
        renderTree();
        updateMapMarkers();
        renderTimeline();
    });
}

// --- NAVIGASJON (TABS) ---
document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // 1. Visuell tab state
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 2. Skjul/vis seksjoner
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
        const targetId = tab.dataset.tab + '-view';
        document.getElementById(targetId).classList.remove('hidden');

        // 3. Spesialhåndtering
        if (tab.dataset.tab === 'map') {
            initMap(); // Sørg for at kartet tegnes riktig når det blir synlig
        }
    });
});

// --- TEGNE TREET (RENDERING) ---
function renderTree() {
    const rowParents = document.getElementById('row-parents');
    const rowFocus = document.getElementById('row-focus');
    const rowChildren = document.getElementById('row-children');

    if (!rowParents || !rowFocus || !rowChildren) return;

    rowParents.innerHTML = '';
    rowFocus.innerHTML = '';
    rowChildren.innerHTML = '';

    if (people.length === 0) {
        rowFocus.innerHTML = `<button class="btn-primary" onclick="window.openModal('create-first')">Start familietreet</button>`;
        return;
    }

    const focusPerson = people.find(p => p.id === focusPersonId);
    if (!focusPerson) return;

    // A. Foreldre
    const father = people.find(p => p.id === focusPerson.fatherId);
    const mother = people.find(p => p.id === focusPerson.motherId);
    rowParents.appendChild(createSlot(father, 'Far', 'add-parent-m'));
    rowParents.appendChild(createSlot(mother, 'Mor', 'add-parent-f'));

    // B. Partner
    const partner = people.find(p => p.id === focusPerson.partnerId);
    if (partner) {
        const pCard = createCard(partner);
        pCard.onclick = () => { focusPersonId = partner.id; renderTree(); };
        rowFocus.appendChild(pCard);

        const heart = document.createElement('div');
        heart.innerHTML = '<i class="ph-fill ph-heart" style="color:var(--female-color); font-size:1.5rem;"></i>';
        rowFocus.appendChild(heart);
    }

    // C. Fokus Person
    rowFocus.appendChild(createCard(focusPerson, true));

    // D. Barn
    const children = people.filter(p => p.fatherId === focusPersonId || p.motherId === focusPersonId);
    children.forEach(child => {
        const cCard = createCard(child);
        cCard.onclick = () => { focusPersonId = child.id; renderTree(); };
        rowChildren.appendChild(cCard);
    });
}

function createCard(person, isFocus = false) {
    const el = document.createElement('div');
    el.className = `card ${isFocus ? 'focus' : ''} ${person.gender === 'F' ? 'female' : 'male'}`;

    const year = person.birthDate ? new Date(person.birthDate).getFullYear() : '????';
    const dead = person.deathDate ? '✝ ' : '';

    el.innerHTML = `
        <i class="card-icon ph ${person.gender === 'F' ? 'ph-user' : 'ph-user'}"></i>
        <h3>${person.name}</h3>
        <p>${dead}${year}</p>
        ${person.location ? '<span class="info-badge"><i class="ph-bold ph-map-pin"></i> ' + person.location.split(',')[0] + '</span>' : ''}
    `;

    if (isFocus) {
        const actions = document.createElement('div');
        actions.className = 'focus-actions';

        const btnChild = document.createElement('button');
        btnChild.className = 'btn-mini-add add-child';
        btnChild.innerHTML = '<i class="ph-bold ph-plus"></i>';
        btnChild.onclick = (e) => { e.stopPropagation(); window.openModal('add-child'); };
        actions.appendChild(btnChild);

        if (!person.partnerId) {
            const btnPartner = document.createElement('button');
            btnPartner.className = 'btn-mini-add add-partner';
            btnPartner.innerHTML = '<i class="ph-bold ph-heart"></i>';
            btnPartner.onclick = (e) => { e.stopPropagation(); window.openModal('add-partner'); };
            actions.appendChild(btnPartner);
        }
        el.appendChild(actions);
    }
    return el;
}

function createSlot(person, label, actionType) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slot-container';
    wrapper.innerHTML = `<span class="slot-label">${label}</span>`;

    if (person) {
        const card = createCard(person);
        card.onclick = () => { focusPersonId = person.id; renderTree(); };
        wrapper.appendChild(card);
    } else {
        const btn = document.createElement('div');
        btn.className = 'btn-add-slot';
        btn.innerHTML = '<i class="ph-bold ph-plus"></i>';
        btn.onclick = () => window.openModal(actionType);
        wrapper.appendChild(btn);
    }
    return wrapper;
}

// --- KART FUNKSJONALITET (Leaflet) ---
function initMap() {
    if (mapInstance) {
        mapInstance.invalidateSize(); // Viktig når kartet vises etter å ha vært skjult
        return;
    }

    // Startposisjon: Norge (omtrentlig)
    mapInstance = L.map('map-container').setView([65.0, 13.0], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(mapInstance);

    updateMapMarkers();
}

async function updateMapMarkers() {
    if (!mapInstance) return;

    // Fjern gamle markører (enklest å tømme og tegne på nytt for nå)
    mapInstance.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            mapInstance.removeLayer(layer);
        }
    });

    for (const p of people) {
        if (p.location) {
            // Prøv å finne koordinater. For nå, antar vi at input KAN være "lat,lng"
            // I en ekte app ville vi brukt en geocoding service her.
            // For demo: Hvis location inneholder komma og tall, bruk det.
            // Ellers, randomiser litt rundt Grimstad for demo-formål hvis det står "Grimstad"

            let lat = 0, lng = 0;

            if (p.location.includes(',')) {
                const parts = p.location.split(',');
                if (!isNaN(parseFloat(parts[0]))) {
                    lat = parseFloat(parts[0]);
                    lng = parseFloat(parts[1]);
                }
            } else if (p.location.toLowerCase().includes('grimstad')) {
                lat = 58.34 + (Math.random() * 0.05 - 0.025);
                lng = 8.59 + (Math.random() * 0.05 - 0.025);
            } else if (p.location.toLowerCase().includes('oslo')) {
                lat = 59.91; lng = 10.75;
            }

            if (lat !== 0) {
                L.marker([lat, lng])
                    .addTo(mapInstance)
                    .bindPopup(`<b>${p.name}</b><br>${p.location}`);
            }
        }
    }
}

// --- TIDSLINJE FUNKSJONALITET ---
function renderTimeline() {
    const container = document.getElementById('timeline-content');
    if (!container) return;

    container.innerHTML = '';

    // Lag en liste av hendelser (Fødsel og Død)
    const events = [];
    people.forEach(p => {
        if (p.birthDate) {
            events.push({ date: p.birthDate, type: 'Født', person: p.name, desc: p.description });
        }
        if (p.deathDate) {
            events.push({ date: p.deathDate, type: 'Død', person: p.name });
        }
    });

    // Sorter kronologisk
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    events.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'timeline-item';

        const dateStr = new Date(ev.date).toLocaleDateString('no-NO', { year: 'numeric', month: 'long', day: 'numeric' });

        item.innerHTML = `
            <div class="timeline-date">${dateStr}</div>
            <div class="timeline-content">
                <strong>${ev.person}</strong> ${ev.type.toLowerCase()}
                ${ev.desc ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.3rem;">${ev.desc}</p>` : ''}
            </div>
        `;
        container.appendChild(item);
    });
}


// --- MODAL & LAGRING ---
window.openModal = (action) => {
    modalAction = action;
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('hidden');

    // Nullstill skjema
    ['inp-name', 'inp-birth', 'inp-death', 'inp-desc', 'inp-location', 'selected-existing-id'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const title = document.getElementById('modal-title');
    const genderRadios = document.getElementsByName('gender');

    const setGender = (val, disabled) => {
        genderRadios.forEach(r => {
            r.disabled = disabled;
            if (val && r.value === val) r.checked = true;
        });
    };

    if (action === 'add-parent-m') { title.textContent = "Legg til Far"; setGender('M', true); }
    else if (action === 'add-parent-f') { title.textContent = "Legg til Mor"; setGender('F', true); }
    else if (action === 'add-child') { title.textContent = "Legg til Barn"; setGender(null, false); }
    else if (action === 'add-partner') { title.textContent = "Legg til Partner"; setGender(null, false); }
    else { title.textContent = "Start Tre"; setGender(null, false); }

    setMode('new');
    renderExistingList();
};

const closeBtn = document.getElementById('btn-close-modal');
if (closeBtn) closeBtn.onclick = () => document.getElementById('modal-overlay').classList.add('hidden');

const saveBtn = document.getElementById('btn-save');
if (saveBtn) {
    saveBtn.onclick = async () => {
        if (!currentUser) return;
        const focusP = people.find(p => p.id === focusPersonId);
        let targetId = null;

        if (modalMode === 'new') {
            const newPerson = {
                name: document.getElementById('inp-name').value,
                birthDate: document.getElementById('inp-birth').value,
                deathDate: document.getElementById('inp-death').value,
                description: document.getElementById('inp-desc').value,
                location: document.getElementById('inp-location').value, // NYTT
                gender: document.querySelector('input[name="gender"]:checked').value,
                fatherId: null, motherId: null, partnerId: null
            };

            if (modalAction === 'add-child' && focusP) {
                if (focusP.gender === 'M') newPerson.fatherId = focusP.id;
                else newPerson.motherId = focusP.id;
                if (focusP.partnerId) {
                    const part = people.find(p => p.id === focusP.partnerId);
                    if (part) { if (part.gender === 'M') newPerson.fatherId = part.id; else newPerson.motherId = part.id; }
                }
            }

            const docRef = await addDoc(collection(db, 'familyMembers'), newPerson);
            targetId = docRef.id;
            if (modalAction === 'create-first') focusPersonId = targetId;

        } else {
            targetId = document.getElementById('selected-existing-id').value;
        }

        if (focusP && targetId) {
            const col = collection(db, 'familyMembers');
            const updates = [];

            if (modalAction === 'add-parent-m') updates.push(updateDoc(doc(col, focusPersonId), { fatherId: targetId }));
            else if (modalAction === 'add-parent-f') updates.push(updateDoc(doc(col, focusPersonId), { motherId: targetId }));
            else if (modalAction === 'add-partner') {
                updates.push(updateDoc(doc(col, focusPersonId), { partnerId: targetId }));
                updates.push(updateDoc(doc(col, targetId), { partnerId: focusPersonId }));
            }
            else if (modalAction === 'add-child' && modalMode === 'existing') {
                const upd = {};
                if (focusP.gender === 'M') upd.fatherId = focusP.id; else upd.motherId = focusP.id;
                updates.push(updateDoc(doc(col, targetId), upd));
            }
            await Promise.all(updates);
        }
        document.getElementById('modal-overlay').classList.add('hidden');
    };
}

function setMode(mode) {
    modalMode = mode;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.toggle-btn[data-mode="${mode}"]`);
    if (btn) btn.classList.add('active');
    document.getElementById('form-new').className = mode === 'new' ? '' : 'hidden';
    document.getElementById('form-existing').className = mode === 'existing' ? '' : 'hidden';
}

document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.onclick = () => setMode(btn.dataset.mode);
});

function renderExistingList() {
    const list = document.getElementById('existing-list');
    if (!list) return;
    list.innerHTML = '';
    const candidates = people.filter(p => p.id !== focusPersonId);
    candidates.forEach(p => {
        const d = document.createElement('div');
        d.className = 'person-option';
        d.innerHTML = `<span>${p.name}</span>`;
        d.onclick = () => {
            document.querySelectorAll('.person-option').forEach(x => x.classList.remove('selected'));
            d.classList.add('selected');
            document.getElementById('selected-existing-id').value = p.id;
        };
        list.appendChild(d);
    });
}

// --- ZOOM ---
const zoomIn = document.getElementById('btn-zoom-in');
if (zoomIn) zoomIn.onclick = () => {
    currentScale += 0.1;
    document.getElementById('tree-grid').style.transform = `scale(${currentScale})`;
    document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + '%';
};

const zoomOut = document.getElementById('btn-zoom-out');
if (zoomOut) zoomOut.onclick = () => {
    if (currentScale > 0.4) currentScale -= 0.1;
    document.getElementById('tree-grid').style.transform = `scale(${currentScale})`;
    document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + '%';
};
