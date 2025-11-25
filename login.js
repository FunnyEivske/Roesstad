import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./config.js";

// --- INIT ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- DOM ELEMENTS ---
const form = document.getElementById('login-form');
const emailInput = document.getElementById('inp-email');
const passwordInput = document.getElementById('inp-password');
const loginBtn = document.getElementById('btn-login');
const errorMsg = document.getElementById('error-msg');

// --- LOGIN LOGIC ---
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError("Vennligst fyll ut både e-post og passord.");
            return;
        }

        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Redirect on success
            window.location.href = "Røsstad.html";
        } catch (error) {
            console.error("Login error:", error);
            handleError(error);
            setLoading(false);
        }
    });
}

function setLoading(isLoading) {
    if (isLoading) {
        loginBtn.textContent = "Logger inn...";
        loginBtn.disabled = true;
        errorMsg.textContent = "";
    } else {
        loginBtn.textContent = "Logg Inn";
        loginBtn.disabled = false;
    }
}

function handleError(error) {
    let message = "En ukjent feil oppstod.";

    switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            message = "Feil e-post eller passord.";
            break;
        case 'auth/too-many-requests':
            message = "For mange forsøk. Vennligst vent litt og prøv igjen.";
            break;
        case 'auth/invalid-email':
            message = "Ugyldig e-postadresse.";
            break;
    }

    showError(message);
}

function showError(msg) {
    errorMsg.textContent = msg;
    // Shake animation effect
    const container = document.querySelector('.login-container');
    container.style.animation = 'none';
    container.offsetHeight; /* trigger reflow */
    container.style.animation = 'shake 0.5s';
}

// Add shake keyframes dynamically
const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
}
`;
document.head.appendChild(style);
