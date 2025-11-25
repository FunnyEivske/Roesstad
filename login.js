import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Håndter klikk på Logg Inn
const loginBtn = document.getElementById('btn-login');

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('inp-email').value;
        const password = document.getElementById('inp-password').value;
        const msg = document.getElementById('error-msg');

        // Enkel sjekk at feltene ikke er tomme
        if (!email || !password) {
            msg.textContent = "Du må skrive inn både e-post og passord.";
            return;
        }

        loginBtn.textContent = "Sjekker...";
        msg.textContent = "";

        try {
            // Prøver å logge inn med e-post og passord
            await signInWithEmailAndPassword(auth, email, password);

            // Suksess -> Gå til hovedsiden
            window.location.href = "Røsstad.html";

        } catch (error) {
            console.error(error);
            // Gi en forståelig feilmelding
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg.textContent = "Feil e-post eller passord.";
            } else if (error.code === 'auth/too-many-requests') {
                msg.textContent = "For mange forsøk. Prøv igjen senere.";
            } else {
                msg.textContent = "Feil: " + error.message;
            }
            loginBtn.textContent = "Logg Inn";
        }
    });
}
