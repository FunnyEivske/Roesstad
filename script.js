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

// --- IMMEDIATE SETUP (UI Handlers) ---
// This ensures buttons work even if Auth is slow
setupTabs();
setupZoom();
setupModal();
setupHelp();
setupFAB();

// --- AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        state.user = user;
        startDataListener();
    } else {
        // Redirect to login if not authenticated
        // Note: In local development with file://, this might trigger unexpectedly.
        // For now, we assume index.html is the login page.
        if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
            window.location.href = "index.html";
        }
    }
});

document.getElementById('btn-logout')?.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// --- DATA LISTENER ---
function startDataListener() {
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
            const viewEl = document.getElementById(viewId);
            if (viewEl) viewEl.classList.remove('hidden');

            // Special handling for Map resize
            if (btn.dataset.view === 'map' && state.map) {
                setTimeout(() => state.map.invalidateSize(), 100);
            }
        });
    });
}

// --- TREE RENDERER ---
// --- TREE RENDERER (GLOBAL) ---
function renderTree() {
    const grid = document.getElementById('tree-grid');
    const svg = document.getElementById('tree-svg');
    if (!grid || !svg) return;

    grid.innerHTML = '';
    svg.innerHTML = ''; // Clear lines

    if (state.people.length === 0) {
        grid.innerHTML = `<div style="text-align:center; color:var(--color-text-muted); margin-top:4rem;">
            <p>Ingen personer i treet ennå.</p>
            <p>Klikk på <i class="ph-bold ph-plus-circle" style="color:var(--color-primary);"></i> nede til høyre for å starte!</p>
        </div>`;
        return;
    }

    const visited = new Set();
    const roots = findRoots();

    roots.forEach(root => {
        if (!visited.has(root.id)) {
            const treeNode = buildTreeNode(root, visited);
            grid.appendChild(treeNode);
        }
    });

    // Draw lines after layout is computed
    setTimeout(drawConnections, 100);
    window.addEventListener('resize', drawConnections);
}

function findRoots() {
    // A root is someone whose parents are NOT in the current list
    return state.people.filter(p => {
        const father = state.people.find(parent => parent.id === p.fatherId);
        const mother = state.people.find(parent => parent.id === p.motherId);
        return !father && !mother;
    });
}

function buildTreeNode(person, visited) {
    visited.add(person.id);

    // Container
    const container = document.createElement('div');
    container.className = 'node-container';

    // 1. Couple Wrapper
    const coupleWrapper = document.createElement('div');
    coupleWrapper.className = 'couple-wrapper';

    // Person Card
    const pCard = createCard(person);
    pCard.onclick = () => setFocus(person.id); // Keep focus logic for editing
    coupleWrapper.appendChild(pCard);

    // Partner Card
    if (person.partnerId) {
        const partner = state.people.find(p => p.id === person.partnerId);
        if (partner && !visited.has(partner.id)) {
            visited.add(partner.id);
            const partCard = createCard(partner);
            partCard.onclick = () => setFocus(partner.id);
            coupleWrapper.appendChild(partCard);
        }
    }
    container.appendChild(coupleWrapper);

    // 2. Children
    // Find children where this person (or partner) is a parent
    const children = state.people.filter(p =>
        p.fatherId === person.id || p.motherId === person.id ||
        (person.partnerId && (p.fatherId === person.partnerId || p.motherId === person.partnerId))
    );

    if (children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children-container';

        // Sort children by birth date
        children.sort((a, b) => (a.birthDate || '9999') > (b.birthDate || '9999') ? 1 : -1);

        children.forEach(child => {
            if (!visited.has(child.id)) {
                const childNode = buildTreeNode(child, visited);
                childrenContainer.appendChild(childNode);
            }
        });
        container.appendChild(childrenContainer);
    }

    return container;
}
function drawConnections() {
    const svg = document.getElementById('tree-svg');
    const grid = document.getElementById('tree-grid');
    if (!svg || !grid) return;

    svg.innerHTML = '';
    const svgRect = svg.getBoundingClientRect();

    // Map all visible cards by ID
    const cardMap = new Map();
    document.querySelectorAll('.card').forEach(card => {
        if (card.dataset.id) cardMap.set(card.dataset.id, card);
    });

    const drawnPartners = new Set();

    // Helper for coordinates
    const getCenter = (el) => {
        const rect = el.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2 - svgRect.left,
            y: rect.top + rect.height / 2 - svgRect.top,
            bottom: rect.bottom - svgRect.top,
            top: rect.top - svgRect.top
        };
    };

    state.people.forEach(p => {
        const pCard = cardMap.get(p.id);
        if (!pCard) return;

        const pCenter = getCenter(pCard);

        // 1. Parent Connections
        [p.fatherId, p.motherId].forEach(parentId => {
            if (parentId) {
                const parentCard = cardMap.get(parentId);
                if (parentCard) {
                    const parCenter = getCenter(parentCard);
                    // Draw Curved Line
                    // From Parent Bottom to Child Top
                    const path = `M ${parCenter.x} ${parCenter.bottom} 
                                C ${parCenter.x} ${parCenter.bottom + 50}, 
                                  ${pCenter.x} ${pCenter.top - 50}, 
                                  ${pCenter.x} ${pCenter.top}`;
                    createPath(svg, path);
                }
            }
        });

        // 2. Partner Connection
        if (p.partnerId) {
            const partnerCard = cardMap.get(p.partnerId);
            if (partnerCard) {
                // Avoid drawing twice
                const pairId = [p.id, p.partnerId].sort().join('-');
                if (!drawnPartners.has(pairId)) {
                    drawnPartners.add(pairId);
                    const partCenter = getCenter(partnerCard);
                    createPath(svg, `M ${pCenter.x} ${pCenter.y} L ${partCenter.x} ${partCenter.y}`);
                }
            }
        }
    });
}

function createPath(svg, d) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "connector");
    svg.appendChild(path);
}

function setFocus(id) {
    state.focusId = id;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('focus'));
    renderTree();
}

function createCard(person) {
    const isFocus = (person.id === state.focusId);
    const el = document.createElement('div');
    el.className = `card ${isFocus ? 'focus' : ''} ${person.gender === 'F' ? 'female' : 'male'}`;
    el.dataset.id = person.id; // Crucial for connections

    const year = person.birthDate ? new Date(person.birthDate).getFullYear() : '';
    const dead = person.deathDate ? '✝ ' : '';
    const loc = person.location ? person.location.split(',')[0] : '';

    el.innerHTML = `
        <i class="ph-fill ph-user card-avatar"></i>
        <div class="card-name">${person.name}</div>
        <div class="card-dates">${dead}${year}</div>
        ${loc ? `<div class="card-location"><i class="ph-bold ph-map-pin"></i> ${loc}</div>` : ''}
    `;

    // Always show actions if focused
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
    // Deprecated in global view, but kept if needed for other views
    return document.createElement('div');
}


// --- MAP RENDERER ---
function renderMap() {
    if (!state.map) {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

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
        const overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.classList.remove('hidden');

        // Reset Form
        document.querySelectorAll('.input-field').forEach(i => i.value = '');

        // Set Title
        const title = document.getElementById('modal-title');
        if (title) {
            if (action === 'add-parent-m') title.textContent = "Legg til Far";
            else if (action === 'add-parent-f') title.textContent = "Legg til Mor";
            else if (action === 'add-child') title.textContent = "Legg til Barn";
            else if (action === 'add-partner') title.textContent = "Legg til Partner";
            else title.textContent = "Legg til Person";
        }

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

    const closeBtn = document.getElementById('btn-close-modal');
    if (closeBtn) closeBtn.onclick = () => {
        document.getElementById('modal-overlay').classList.add('hidden');
    };

    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.onclick = async () => {
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

            // If creating first person or using generic add
            if (state.modal.action === 'create-first' || !state.focusId) {
                state.focusId = targetId;
            }

        } else {
            targetId = document.getElementById('selected-existing-id').value;
        }

        // Link Relations
        if (focusP && targetId && state.modal.action !== 'create-first' && state.modal.action !== 'add-generic') {
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
    if (!list) return;
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

    const btnIn = document.getElementById('btn-zoom-in');
    if (btnIn) btnIn.onclick = () => {
        state.scale += 0.1;
        updateZoom();
    };

    const btnOut = document.getElementById('btn-zoom-out');
    if (btnOut) btnOut.onclick = () => {
        if (state.scale > 0.4) state.scale -= 0.1;
        updateZoom();
    };

    function updateZoom() {
        if (grid) grid.style.transform = `scale(${state.scale})`;
        if (display) display.textContent = Math.round(state.scale * 100) + '%';
    }
}

// --- HELP ---
function setupHelp() {
    const btn = document.getElementById('btn-help');
    const modal = document.getElementById('modal-help');
    const close = document.getElementById('btn-close-help');

    if (btn && modal) {
        btn.onclick = () => modal.classList.remove('hidden');
    }
    if (close && modal) {
        close.onclick = () => modal.classList.add('hidden');
    }
}

// --- FAB ---
function setupFAB() {
    const fab = document.getElementById('fab-add');
    if (fab) {
        fab.onclick = () => window.openModal('add-generic');
    }
}
