import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

// --- INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- STATE ---
const state = {
    user: null,
    people: [],
    focusId: null,
    scale: 1.0,
    modal: {
        action: null, // 'add-child', 'add-parent-m', etc.
        mode: 'new'   // 'new' or 'existing'
    },
    map: null
};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        state.user = user;
        initApp();
    } else {
        window.location.href = "index.html";
    }
});

document.getElementById('btn-logout')?.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// --- APP LOGIC ---
function initApp() {
    // Start Data Listener
    const q = query(collection(db, 'familyMembers'));
    onSnapshot(q, (snapshot) => {
        state.people = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Set initial focus if needed
        if (!state.focusId && state.people.length > 0) {
            const me = state.people.find(p => p.name && (p.name.toLowerCase().includes('eivind') || p.name.toLowerCase() === 'meg'));
            state.focusId = me ? me.id : state.people[0].id;
        }

        renderAll();
    });

    // Setup Navigation
    setupTabs();
    setupZoom();
    setupModal();
}

function renderAll() {
    renderTree();
    renderMap();
    renderTimeline();
}

// --- TAB NAVIGATION ---
function setupTabs() {
    document.querySelectorAll('.nav-tab[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update Active Tab
            document.querySelectorAll('.nav-tab[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show View
            document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
            const viewId = `view-${btn.dataset.view}`;
            document.getElementById(viewId).classList.remove('hidden');

            // Special handling for Map resize
            if (btn.dataset.view === 'map' && state.map) {
                setTimeout(() => state.map.invalidateSize(), 100);
            }
        });
    });
}

// --- TREE RENDERER ---
function renderTree() {
    const parentsRow = document.getElementById('row-parents');
    const focusRow = document.getElementById('row-focus');
    const childrenRow = document.getElementById('row-children');

    if (!parentsRow || !focusRow || !childrenRow) return;

    parentsRow.innerHTML = '';
    focusRow.innerHTML = '';
    childrenRow.innerHTML = '';

    if (state.people.length === 0) {
        focusRow.innerHTML = `<button class="btn-primary" onclick="window.openModal('create-first')">Start familietreet</button>`;
        return;
    }

    const focusPerson = state.people.find(p => p.id === state.focusId);
    if (!focusPerson) return;

    // 1. Parents
    const father = state.people.find(p => p.id === focusPerson.fatherId);
    const mother = state.people.find(p => p.id === focusPerson.motherId);
    parentsRow.appendChild(createSlot(father, 'Far', 'add-parent-m'));
    parentsRow.appendChild(createSlot(mother, 'Mor', 'add-parent-f'));

    // 2. Partner (Left of Focus)
    const partner = state.people.find(p => p.id === focusPerson.partnerId);
    if (partner) {
        const pCard = createCard(partner);
        pCard.onclick = () => setFocus(partner.id);
        focusRow.appendChild(pCard);

        // Heart Icon
        const heart = document.createElement('div');
        heart.innerHTML = '<i class="ph-fill ph-heart" style="color:var(--color-female); font-size:1.5rem;"></i>';
        focusRow.appendChild(heart);
    }

    // 3. Focus Person
    focusRow.appendChild(createCard(focusPerson, true));

    // 4. Children
    const children = state.people.filter(p => p.fatherId === state.focusId || p.motherId === state.focusId);
    children.forEach(child => {
        const cCard = createCard(child);
        cCard.onclick = () => setFocus(child.id);
        childrenRow.appendChild(cCard);
    });
}

function setFocus(id) {
    state.focusId = id;
    renderTree();
}

function createCard(person, isFocus = false) {
    const el = document.createElement('div');
    el.className = `card ${isFocus ? 'focus' : ''} ${person.gender === 'F' ? 'female' : 'male'}`;

    const year = person.birthDate ? new Date(person.birthDate).getFullYear() : '';
    const dead = person.deathDate ? '✝ ' : '';
    const loc = person.location ? person.location.split(',')[0] : '';

    el.innerHTML = `
        <i class="ph-fill ph-user card-avatar"></i>
        <div class="card-name">${person.name}</div>
        <div class="card-dates">${dead}${year}</div>
        ${loc ? `<div class="card-location"><i class="ph-bold ph-map-pin"></i> ${loc}</div>` : ''}
    `;

    if (isFocus) {
        const actions = document.createElement('div');
        actions.className = 'mini-actions';

        // Add Child Button
        const btnChild = document.createElement('button');
        btnChild.className = 'btn-mini btn-add-child';
        btnChild.innerHTML = '<i class="ph-bold ph-plus"></i>';
        btnChild.title = "Legg til barn";
        btnChild.onclick = (e) => { e.stopPropagation(); window.openModal('add-child'); };
        actions.appendChild(btnChild);

        // Add Partner Button (if none)
        if (!person.partnerId) {
            const btnPartner = document.createElement('button');
            btnPartner.className = 'btn-mini btn-add-partner';
            btnPartner.innerHTML = '<i class="ph-bold ph-heart"></i>';
            btnPartner.title = "Legg til partner";
            btnPartner.onclick = (e) => { e.stopPropagation(); window.openModal('add-partner'); };
            actions.appendChild(btnPartner);
        }
        el.appendChild(actions);
    }
    return el;
}

function createSlot(person, label, action) {
    const wrapper = document.createElement('div');
    wrapper.className = 'slot';
    wrapper.innerHTML = `<span class="slot-label">${label}</span>`;

    if (person) {
        const card = createCard(person);
        card.onclick = () => setFocus(person.id);
        wrapper.appendChild(card);
    } else {
        const btn = document.createElement('div');
        btn.className = 'btn-slot';
        btn.innerHTML = '<i class="ph-bold ph-plus"></i>';
        btn.onclick = () => window.openModal(action);
        wrapper.appendChild(btn);
    }
    return wrapper;
}

// --- MAP RENDERER ---
function renderMap() {
    if (!state.map) {
        state.map = L.map('map-container').setView([65.0, 13.0], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(state.map);
    }

    // Clear existing markers
    state.map.eachLayer(layer => {
        if (layer instanceof L.Marker) state.map.removeLayer(layer);
    });

    // Add markers
    state.people.forEach(p => {
        if (p.location) {
            // Simple geocoding simulation for demo
            let lat = 0, lng = 0;
            if (p.location.includes(',')) {
                const parts = p.location.split(',');
                lat = parseFloat(parts[0]);
                lng = parseFloat(parts[1]);
            } else if (p.location.toLowerCase().includes('grimstad')) {
                lat = 58.34 + (Math.random() * 0.02); lng = 8.59 + (Math.random() * 0.02);
            } else if (p.location.toLowerCase().includes('oslo')) {
                lat = 59.91; lng = 10.75;
            }

            if (lat && lng) {
                L.marker([lat, lng]).addTo(state.map)
                    .bindPopup(`<b>${p.name}</b><br>${p.location}`);
            }
        }
    });
}

// --- TIMELINE RENDERER ---
function renderTimeline() {
    const container = document.getElementById('timeline-list');
    if (!container) return;

    container.innerHTML = '';
    const events = [];

    state.people.forEach(p => {
        if (p.birthDate) events.push({ date: p.birthDate, type: 'Født', person: p.name, desc: p.description });
        if (p.deathDate) events.push({ date: p.deathDate, type: 'Død', person: p.name });
    });

    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    events.forEach(ev => {
        const div = document.createElement('div');
        div.className = 'timeline-event';
        const dateStr = new Date(ev.date).toLocaleDateString('no-NO', { year: 'numeric', month: 'long', day: 'numeric' });

        div.innerHTML = `
            <div class="event-date">${dateStr}</div>
            <div class="event-card">
                <strong>${ev.person}</strong> ${ev.type.toLowerCase()}
                ${ev.desc ? `<p style="font-size:0.85rem; color:var(--color-text-muted); margin-top:0.5rem;">${ev.desc}</p>` : ''}
            </div>
        `;
        container.appendChild(div);
    });
}

// --- MODAL LOGIC ---
function setupModal() {
    window.openModal = (action) => {
        state.modal.action = action;
        document.getElementById('modal-overlay').classList.remove('hidden');

        // Reset Form
        document.querySelectorAll('.input-field').forEach(i => i.value = '');

        // Set Title
        const title = document.getElementById('modal-title');
        if (action === 'add-parent-m') title.textContent = "Legg til Far";
        else if (action === 'add-parent-f') title.textContent = "Legg til Mor";
        else if (action === 'add-child') title.textContent = "Legg til Barn";
        else if (action === 'add-partner') title.textContent = "Legg til Partner";
        else title.textContent = "Start Tre";

        // Default Mode
        window.setModalMode('new');
        renderExistingList();
    };

    window.setModalMode = (mode) => {
        state.modal.mode = mode;
        document.getElementById('tab-new').classList.toggle('active', mode === 'new');
        document.getElementById('tab-existing').classList.toggle('active', mode === 'existing');
        document.getElementById('form-new').classList.toggle('hidden', mode !== 'new');
        document.getElementById('form-existing').classList.toggle('hidden', mode !== 'existing');
    };

    document.getElementById('btn-close-modal').onclick = () => {
        document.getElementById('modal-overlay').classList.add('hidden');
    };

    document.getElementById('btn-save').onclick = async () => {
        const focusP = state.people.find(p => p.id === state.focusId);
        let targetId = null;

        if (state.modal.mode === 'new') {
            const newPerson = {
                name: document.getElementById('inp-name').value,
                birthDate: document.getElementById('inp-birth').value,
                deathDate: document.getElementById('inp-death').value,
                location: document.getElementById('inp-location').value,
                description: document.getElementById('inp-desc').value,
                gender: document.querySelector('input[name="gender"]:checked').value,
                fatherId: null, motherId: null, partnerId: null
            };

            // Auto-link logic
            if (state.modal.action === 'add-child' && focusP) {
                if (focusP.gender === 'M') newPerson.fatherId = focusP.id;
                else newPerson.motherId = focusP.id;

                if (focusP.partnerId) {
                    const part = state.people.find(p => p.id === focusP.partnerId);
                    if (part) {
                        if (part.gender === 'M') newPerson.fatherId = part.id;
                        else newPerson.motherId = part.id;
                    }
                }
            }

            const docRef = await addDoc(collection(db, 'familyMembers'), newPerson);
            targetId = docRef.id;
            if (state.modal.action === 'create-first') state.focusId = targetId;

        } else {
            targetId = document.getElementById('selected-existing-id').value;
        }

        // Link Relations
        if (focusP && targetId) {
            const col = collection(db, 'familyMembers');
            const updates = [];

            if (state.modal.action === 'add-parent-m') updates.push(updateDoc(doc(col, state.focusId), { fatherId: targetId }));
            else if (state.modal.action === 'add-parent-f') updates.push(updateDoc(doc(col, state.focusId), { motherId: targetId }));
            else if (state.modal.action === 'add-partner') {
                updates.push(updateDoc(doc(col, state.focusId), { partnerId: targetId }));
                updates.push(updateDoc(doc(col, targetId), { partnerId: state.focusId }));
            } else if (state.modal.action === 'add-child' && state.modal.mode === 'existing') {
                const upd = {};
                if (focusP.gender === 'M') upd.fatherId = focusP.id; else upd.motherId = focusP.id;
                updates.push(updateDoc(doc(col, targetId), upd));
            }
            await Promise.all(updates);
        }

        document.getElementById('modal-overlay').classList.add('hidden');
    };
}

function renderExistingList() {
    const list = document.getElementById('existing-list');
    list.innerHTML = '';
    state.people.filter(p => p.id !== state.focusId).forEach(p => {
        const div = document.createElement('div');
        div.style.padding = '0.5rem';
        div.style.borderBottom = '1px solid #f1f5f9';
        div.style.cursor = 'pointer';
        div.textContent = p.name;
        div.onclick = () => {
            document.getElementById('selected-existing-id').value = p.id;
            div.style.background = '#f0fdf4';
        };
        list.appendChild(div);
    });
}

// --- ZOOM ---
function setupZoom() {
    const grid = document.getElementById('tree-grid');
    const display = document.getElementById('zoom-display');

    document.getElementById('btn-zoom-in').onclick = () => {
        state.scale += 0.1;
        updateZoom();
    };
    document.getElementById('btn-zoom-out').onclick = () => {
        if (state.scale > 0.4) state.scale -= 0.1;
        updateZoom();
    };

    function updateZoom() {
        grid.style.transform = `scale(${state.scale})`;
        display.textContent = Math.round(state.scale * 100) + '%';
    }
}
