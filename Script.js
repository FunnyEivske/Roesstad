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

// --- SIKKERHETSSJEKK (Kjøres med en gang) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Bruker er logget inn
        currentUser = user;
        startDataListener(); 
    } else {
        // Ingen bruker -> Kast tilbake til logg inn
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
    // Henter alle familiemedlemmer i sanntid
    const q = query(collection(db, 'familyMembers'));
    
    onSnapshot(q, (snapshot) => {
        people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Hvis vi ikke har valgt en person å fokusere på ennå:
        if (!focusPersonId && people.length > 0) {
            // Prøv å finne "Eivind" eller "Meg" som startperson, ellers ta den første
            const me = people.find(p => p.name && (p.name.toLowerCase().includes('eivind') || p.name.toLowerCase() === 'meg'));
            focusPersonId = me ? me.id : people[0].id;
        }
        renderTree();
    });
}

// --- TEGNE TREET (RENDERING) ---
function renderTree() {
    const rowParents = document.getElementById('row-parents');
    const rowFocus = document.getElementById('row-focus');
    const rowChildren = document.getElementById('row-children');
    
    // Sjekk at elementene finnes før vi prøver å bruke dem
    if(!rowParents || !rowFocus || !rowChildren) return;
    
    // Tøm alt innhold først
    rowParents.innerHTML = '';
    rowFocus.innerHTML = '';
    rowChildren.innerHTML = '';
    
    // Hvis databasen er tom
    if (people.length === 0) {
        rowFocus.innerHTML = `<button class="btn-primary" onclick="window.openModal('create-first')">Start familietreet</button>`;
        return;
    }

    const focusPerson = people.find(p => p.id === focusPersonId);
    if (!focusPerson) return;

    // A. Foreldre (Over)
    const father = people.find(p => p.id === focusPerson.fatherId);
    const mother = people.find(p => p.id === focusPerson.motherId);
    rowParents.appendChild(createSlot(father, 'Far', 'add-parent-m'));
    rowParents.appendChild(createSlot(mother, 'Mor', 'add-parent-f'));

    // B. Partner (Ved siden av)
    const partner = people.find(p => p.id === focusPerson.partnerId);
    if (partner) {
        const pCard = createCard(partner);
        pCard.onclick = () => { focusPersonId = partner.id; renderTree(); };
        rowFocus.appendChild(pCard);
        
        // Hjerte mellom dem
        const heart = document.createElement('div');
        heart.innerHTML = '<i class="ph-fill ph-heart" style="color:var(--female-color); font-size:1.5rem;"></i>';
        rowFocus.appendChild(heart);
    }

    // C. Fokus Person (Midten)
    rowFocus.appendChild(createCard(focusPerson, true));

    // D. Barn (Under)
    const children = people.filter(p => p.fatherId === focusPersonId || p.motherId === focusPersonId);
    children.forEach(child => {
        const cCard = createCard(child);
        cCard.onclick = () => { focusPersonId = child.id; renderTree(); };
        rowChildren.appendChild(cCard);
    });
}

// --- HJELPER: LAG KORT ---
function createCard(person, isFocus = false) {
    const el = document.createElement('div');
    el.className = `card ${isFocus ? 'focus' : ''} ${person.gender === 'F' ? 'female' : 'male'}`;
    
    const year = person.birthDate ? new Date(person.birthDate).getFullYear() : '????';
    const dead = person.deathDate ? '✝ ' : '';
    
    el.innerHTML = `
        <i class="card-icon ph ${person.gender === 'F' ? 'ph-user' : 'ph-user'}"></i>
        <h3>${person.name}</h3>
        <p>${dead}${year}</p>
        ${person.description ? '<span class="info-badge">Info</span>' : ''}
    `;

    // Hvis dette er hovedkortet, legg til små pluss-knapper
    if (isFocus) {
        const actions = document.createElement('div');
        actions.className = 'focus-actions';
        
        // Legg til barn (knapp nede)
        const btnChild = document.createElement('button');
        btnChild.className = 'btn-mini-add add-child';
        btnChild.innerHTML = '<i class="ph-bold ph-plus"></i>';
        btnChild.onclick = (e) => { e.stopPropagation(); window.openModal('add-child'); };
        actions.appendChild(btnChild);

        // Legg til partner (knapp til høyre) hvis mangler
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

// --- HJELPER: LAG SLOT (Tom plass eller kort) ---
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

// --- MODAL & LAGRING (Popups) ---

// Gjør funksjonen tilgjengelig i HTML (window.openModal)
window.openModal = (action) => {
    modalAction = action;
    const overlay = document.getElementById('modal-overlay');
    if(overlay) overlay.classList.remove('hidden');
    
    // Nullstill skjema
    const inpName = document.getElementById('inp-name');
    if(inpName) inpName.value = '';
    
    const inpBirth = document.getElementById('inp-birth');
    if(inpBirth) inpBirth.value = '';
    
    const inpDeath = document.getElementById('inp-death');
    if(inpDeath) inpDeath.value = '';
    
    const inpDesc = document.getElementById('inp-desc');
    if(inpDesc) inpDesc.value = '';

    const selExist = document.getElementById('selected-existing-id');
    if(selExist) selExist.value = '';

    const title = document.getElementById('modal-title');
    const genderRadios = document.getElementsByName('gender');
    
    // Hjelper for å sette kjønn
    const setGender = (val, disabled) => {
        genderRadios.forEach(r => {
            r.disabled = disabled;
            if (val && r.value === val) r.checked = true;
        });
    };

    // Tilpass tittel og kjønn basert på hva vi legger til
    if (action === 'add-parent-m') { title.textContent = "Legg til Far"; setGender('M', true); }
    else if (action === 'add-parent-f') { title.textContent = "Legg til Mor"; setGender('F', true); }
    else if (action === 'add-child') { title.textContent = "Legg til Barn"; setGender(null, false); }
    else if (action === 'add-partner') { title.textContent = "Legg til Partner"; setGender(null, false); }
    else { title.textContent = "Start Tre"; setGender(null, false); }

    setMode('new');
    renderExistingList();
};

// Lukk modal knapp
const closeBtn = document.getElementById('btn-close-modal');
if(closeBtn) closeBtn.onclick = () => document.getElementById('modal-overlay').classList.add('hidden');

// Lagre knapp
const saveBtn = document.getElementById('btn-save');
if(saveBtn) {
    saveBtn.onclick = async () => {
        if (!currentUser) return;
        const focusP = people.find(p => p.id === focusPersonId);
        let targetId = null;

        // 1. Enten lag ny person
        if (modalMode === 'new') {
            const newPerson = {
                name: document.getElementById('inp-name').value,
                birthDate: document.getElementById('inp-birth').value,
                deathDate: document.getElementById('inp-death').value,
                description: document.getElementById('inp-desc').value,
                gender: document.querySelector('input[name="gender"]:checked').value,
                fatherId: null, motherId: null, partnerId: null
            };
            
            // Auto-koble foreldre hvis vi legger til et barn
            if (modalAction === 'add-child' && focusP) {
                if (focusP.gender === 'M') newPerson.fatherId = focusP.id;
                else newPerson.motherId = focusP.id;
                
                // Hvis fokuset har en partner, sett den som den andre forelderen
                if (focusP.partnerId) {
                    const part = people.find(p=>p.id === focusP.partnerId);
                    if(part) { if(part.gender==='M') newPerson.fatherId=part.id; else newPerson.motherId=part.id; }
                }
            }

            const docRef = await addDoc(collection(db, 'familyMembers'), newPerson);
            targetId = docRef.id;
            
            // Hvis dette var første person i treet
            if(modalAction === 'create-first') focusPersonId = targetId;

        } else {
            // 2. Eller velg eksisterende
            targetId = document.getElementById('selected-existing-id').value;
        }

        // 3. Opprett relasjoner (linker) i databasen
        if(focusP && targetId) {
            const col = collection(db, 'familyMembers');
            const updates = [];
            
            if(modalAction === 'add-parent-m') updates.push(updateDoc(doc(col, focusPersonId), {fatherId: targetId}));
            else if(modalAction === 'add-parent-f') updates.push(updateDoc(doc(col, focusPersonId), {motherId: targetId}));
            else if(modalAction === 'add-partner') {
                updates.push(updateDoc(doc(col, focusPersonId), {partnerId: targetId}));
                updates.push(updateDoc(doc(col, targetId), {partnerId: focusPersonId}));
            }
            else if(modalAction === 'add-child' && modalMode === 'existing') {
                const upd = {};
                if(focusP.gender === 'M') upd.fatherId = focusP.id; else upd.motherId = focusP.id;
                updates.push(updateDoc(doc(col, targetId), upd));
            }
            await Promise.all(updates);
        }
        document.getElementById('modal-overlay').classList.add('hidden');
    };
}

// Bytt mellom "Ny" og "Eksisterende" fane i modal
function setMode(mode) {
    modalMode = mode;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.toggle-btn[data-mode="${mode}"]`);
    if(btn) btn.classList.add('active');
    document.getElementById('form-new').className = mode === 'new' ? '' : 'hidden';
    document.getElementById('form-existing').className = mode === 'existing' ? '' : 'hidden';
}

document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.onclick = () => setMode(btn.dataset.mode);
});

// Liste over eksisterende personer (for valg)
function renderExistingList() {
    const list = document.getElementById('existing-list');
    if(!list) return;
    list.innerHTML = '';
    const candidates = people.filter(p => p.id !== focusPersonId);
    candidates.forEach(p => {
        const d = document.createElement('div');
        d.className = 'person-option';
        d.innerHTML = `<span>${p.name}</span>`;
        d.onclick = () => { 
            document.querySelectorAll('.person-option').forEach(x=>x.classList.remove('selected'));
            d.classList.add('selected');
            document.getElementById('selected-existing-id').value = p.id;
        };
        list.appendChild(d);
    });
}

// --- ZOOM FUNKSJONALITET ---
const zoomIn = document.getElementById('btn-zoom-in');
if(zoomIn) zoomIn.onclick = () => {
    currentScale += 0.1;
    document.getElementById('tree-grid').style.transform = `scale(${currentScale})`;
    document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + '%';
};

const zoomOut = document.getElementById('btn-zoom-out');
if(zoomOut) zoomOut.onclick = () => {
    if (currentScale > 0.4) currentScale -= 0.1;
    document.getElementById('tree-grid').style.transform = `scale(${currentScale})`;
    document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + '%';
};
