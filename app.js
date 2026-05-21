import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// FIREBASE CONFIGURATION OBJECT
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBw-u4Pzc8zqj4r_Drh6kAY8BIMFcr6gJ8",
    authDomain: "smarttask-fd2f4.firebaseapp.com",
    projectId: "smarttask-fd2f4",
    storageBucket: "smarttask-fd2f4.firebasestorage.app",
    messagingSenderId: "854448533703",
    appId: "1:854448533703:web:5f11346a36e96ae4f58ee2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentCategoryFilter = "All";
let currentSearchQuery = "";
let snapshotUnsubscribe = null;
let cachedTasksArray = []; 

// Runtime variable space to track active 2FA parameters
let systemGeneratedOtp = null;
let pendingRegistrationData = null;

const loginBtn = document.getElementById('loginBtn');
const createAccBtn = document.getElementById('createAccBtn');
const addTaskBtn = document.getElementById('addTaskBtn');
const logoutBtn = document.getElementById('logoutBtn');

// --- CENTRAL AUTH STATE ROUTER PIPELINE ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Safe navigation logic to prevent circular routing traps
        const currentPath = window.location.pathname.toLowerCase();
        if (currentPath.includes("login.html") || currentPath.endsWith("/")) {
            window.location.replace("dashboard.html");
        }
        
        if (addTaskBtn) {
            const emailDisplay = document.getElementById('userEmail') || document.querySelector('.text-sm.text-gray-400');
            if (emailDisplay) emailDisplay.textContent = user.email;
            initClockUtilities();
            setupRealtimeTasks(user.email); // CRITICAL: Only retrieve tasks belonging to this user
            setupDashboardInterfaceListeners();
            injectDynamicFeatureModals(); 
        }
    } else {
        const currentPath = window.location.pathname.toLowerCase();
        if (currentPath.includes("dashboard.html")) {
            window.location.replace("./LOGIN.html");
        }
        if (loginBtn || createAccBtn) {
            setupLoginInterfaceListeners();
            setupOtpInputsBehavior(); 
        }
    }
});

// --- TIME CLOCK ROUTINE ---
function initClockUtilities() {
    const timeEl = document.getElementById('liveTime') || document.querySelector('.text-xl.font-bold');
    const dateEl = document.getElementById('liveDate') || document.querySelector('.text-purple-200.text-sm');
    
    function refreshClock() {
        const now = new Date();
        if(timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if(dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    refreshClock();
    setInterval(refreshClock, 1000);
}

// --- DYNAMICALLY INJECT COMPONENT MODALS TO DOM ---
function injectDynamicFeatureModals() {
    if (document.getElementById('featureModalContainer')) return;

    const modalWrapper = document.createElement('div');
    modalWrapper.id = 'featureModalContainer';
    modalWrapper.innerHTML = `
        <div id="utilityModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 hidden transition-all duration-200">
            <div class="bg-[#151722] border border-[#2A2D3E] rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
                <div class="p-4 border-b border-[#2A2D3E] flex justify-between items-center bg-[#1A1C28]">
                    <h3 id="utilityModalTitle" class="text-base font-bold text-white flex items-center gap-2"></h3>
                    <button type="button" id="closeUtilityModalBtn" class="text-gray-400 hover:text-white transition text-lg p-1">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div id="utilityModalBody" class="p-5 overflow-y-auto text-xs md:text-sm text-gray-300 space-y-4"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modalWrapper);

    document.getElementById('closeUtilityModalBtn').onclick = () => {
        document.getElementById('utilityModal').classList.add('hidden');
    };
}

function triggerFeatureView(featureType) {
    const modal = document.getElementById('utilityModal');
    const titleEl = document.getElementById('utilityModalTitle');
    const bodyEl = document.getElementById('utilityModalBody');
    if (!modal || !titleEl || !bodyEl) return;

    bodyEl.innerHTML = ''; 

    if (featureType === 'Calendar') {
        titleEl.innerHTML = `<i class="fa-solid fa-calendar text-purple-400"></i> Local Schedule Planner`;
        bodyEl.innerHTML = `
            <p class="text-gray-400 text-xs mb-2">Select a date path tracking point to synchronize your scheduling overview indices:</p>
            <input type="date" value="${new Date().toISOString().split('T')[0]}" class="w-full bg-[#0F1015] border border-[#2A2D3E] text-white p-2.5 rounded-xl text-sm focus:outline-none focus:border-[#7B51D3] transition mb-4">
            <div class="text-[11px] font-bold text-purple-400 tracking-wider uppercase mb-1">Active Tasks Set for Today:</div>
            <div class="space-y-2 max-h-[200px] overflow-y-auto">
                ${cachedTasksArray.length === 0 ? '<p class="text-gray-500 text-xs italic">No schedule logs recorded today.</p>' : 
                  cachedTasksArray.map(t => `
                    <div class="bg-[#1A1C28] p-2.5 rounded-lg border border-[#2A2D3E] flex justify-between items-center">
                        <span class="truncate ${t.completed ? 'line-through text-gray-500' : 'text-gray-200'}">${t.title}</span>
                        <span class="text-[10px] bg-[#252836] text-gray-400 px-2 py-0.5 rounded">${t.time}</span>
                    </div>
                  `).join('')}
            </div>
        `;
    } 
    else if (featureType === 'Reminders') {
        titleEl.innerHTML = `<i class="fa-solid fa-bell text-amber-400"></i> System Alerts & Deadlines`;
        const pendingTasks = cachedTasksArray.filter(t => !t.completed);
        bodyEl.innerHTML = `
            <p class="text-gray-400 text-xs mb-3">Active tracking rules are monitoring outstanding tasks remaining item deadlines:</p>
            <div class="space-y-2">
                ${pendingTasks.length === 0 ? `
                    <div class="text-center py-4 text-emerald-400 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-xs font-medium">
                        <i class="fa-solid fa-circle-check mr-1"></i> All systems clear! No pending reminders.
                    </div>` : 
                  pendingTasks.map(t => `
                    <div class="bg-[#1A1C28] p-3 rounded-xl border-l-2 border-amber-500 flex items-center justify-between">
                        <div>
                            <p class="text-xs font-semibold text-gray-200">${t.title}</p>
                            <p class="text-[10px] text-gray-500 mt-0.5">Category: ${t.category}</p>
                        </div>
                        <span class="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                            <i class="fa-regular fa-clock mr-1"></i>${t.time}
                        </span>
                    </div>
                  `).join('')}
            </div>
        `;
    } 
    else if (featureType === 'Inbox') {
        titleEl.innerHTML = `<i class="fa-solid fa-inbox text-blue-400"></i> Workspace Tracking Notifications`;
        bodyEl.innerHTML = `
            <div class="space-y-2">
                <div class="bg-[#1A1C28] p-3 rounded-xl border border-[#2A2D3E] opacity-90">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-blue-400">Database Sync Module</span>
                        <span class="text-[9px] text-gray-500">Just now</span>
                    </div>
                    <p class="text-[11px] text-gray-300">Firestore streaming connection running successfully. Active logs cache initialized properly.</p>
                </div>
            </div>
        `;
    }
    modal.classList.remove('hidden'); 
}

// --- DASHBOARD UI INTERFACE LISTENERS ---
function setupDashboardInterfaceListeners() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const targetBoard = document.getElementById('priorityTasksBoard');

    const jumpToSection = (element) => {
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    ['sideNavHome'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => {
            const topDashboardCard = document.querySelector('.bg-gradient-to-r');
            if (topDashboardCard) topDashboardCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
    });

    ['sideNavTasks', 'featureCardTasks'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => jumpToSection(targetBoard);
    });

    ['sideNavCalendar', 'featureCardCalendar'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => triggerFeatureView('Calendar');
    });

    ['sideNavReminders', 'featureCardReminders'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => triggerFeatureView('Reminders');
    });

    ['sideNavInbox', 'featureCardInbox'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => triggerFeatureView('Inbox');
    });

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('-translate-x-full');
        };
        document.body.onclick = () => {
            sidebar.classList.add('-translate-x-full');
        };
    }

    // --- ABSOLUTE SHUTDOWN LOGOUT ROUTER ---
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            try {
                // 1. Tell Firebase to destroy the secure session token
                await signOut(auth);
                
                // 2. Stop the live database listener (prevents background errors)
                if (snapshotUnsubscribe) {
                    snapshotUnsubscribe();
                    snapshotUnsubscribe = null;
                }

                // 3. Force the browser to redirect to the login page safely
                window.location.replace("LOGIN.html"); 
                
            } catch (error) {
                console.error("Logout failed:", error);
                // Fallback: If Firebase bugs out, force the redirect anyway
                window.location.href = "LOGIN.html";
            }
        };
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentSearchQuery = e.target.value.toLowerCase().trim();
            if (auth.currentUser) setupRealtimeTasks(auth.currentUser.email); 
        };
    }

    const filters = { 'filterAll': 'All', 'filterWork': 'Work', 'filterPersonal': 'Personal' };
    Object.keys(filters).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => {
                currentCategoryFilter = filters[id];
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-[#252836]', 'text-white');
                    b.classList.add('text-gray-400');
                });
                btn.classList.add('bg-[#252836]', 'text-white');
                btn.classList.remove('text-gray-400');
                if (auth.currentUser) setupRealtimeTasks(auth.currentUser.email);
            };
        }
    });

    if (addTaskBtn) {
        addTaskBtn.onclick = async () => {
            const title = prompt("Enter priority description context:");
            if (!title || !title.trim()) return;
            
            const categoryInput = prompt("Set category tracking domain (Work / Personal):", "Work");
            let finalCategory = "Work";
            if(categoryInput && categoryInput.toLowerCase() === 'personal') finalCategory = "Personal";

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            try {
                // ADDED: Saving the task with the creator's logged-in email identifier
                await addDoc(collection(db, "tasks"), {
                    userEmail: auth.currentUser.email, 
                    title: title.trim(),
                    category: finalCategory,
                    time: timeStr,
                    completed: false,
                    createdAt: new Date()
                });
            } catch (error) {
                alert("Task Write Blocked: " + error.message);
            }
        };
    }
}

// --- DATA READ QUERY RENDERING PIPELINE STREAM ---
// MODIFIED: Takes the current user's email to fetch and isolate their unique data partition
function setupRealtimeTasks(userEmail) {
    if (snapshotUnsubscribe) snapshotUnsubscribe(); 

    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    // SECURE FIX: Using Firestore 'where' clause to isolate tasks to the individual user
    const q = query(
        collection(db, "tasks"), 
        where("userEmail", "==", userEmail),
        orderBy("createdAt", "desc")
    );

    snapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        taskList.innerHTML = '';
        cachedTasksArray = []; 
        let total = 0, completedCount = 0, pendingCount = 0;

        snapshot.forEach((docSnapshot) => {
            const task = docSnapshot.data();
            const id = docSnapshot.id;

            cachedTasksArray.push({ id, ...task });

            total++;
            if (task.completed) completedCount++; else pendingCount++;

            if (currentCategoryFilter !== "All" && task.category !== currentCategoryFilter) return;
            if (currentSearchQuery && !task.title.toLowerCase().includes(currentSearchQuery)) return;

            const row = document.createElement('div');
            row.className = `flex items-center justify-between bg-[#1E2030] p-4 rounded-xl mb-1 border border-transparent hover:border-[#7B51D3] transition group ${task.completed ? 'opacity-50' : ''}`;
            const tagColorClass = task.category === 'Work' ? 'bg-[#7B51D3]/20 text-[#9366F9]' : 'bg-emerald-500/20 text-emerald-400';

            row.innerHTML = `
                <div class="flex items-center space-x-4 flex-1 min-w-0">
                    <input type="checkbox" data-id="${id}" ${task.completed ? 'checked' : ''} class="task-toggle-checkbox w-5 h-5 rounded bg-[#0F1015] border-gray-600 text-[#7B51D3] focus:ring-[#7B51D3] cursor-pointer accent-[#7B51D3]">
                    <div class="truncate">
                        <p class="font-semibold text-sm ${task.completed ? 'line-through text-gray-500' : 'text-gray-200'} truncate">${task.title}</p>
                        <p class="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            <span class="${tagColorClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${task.category}</span>
                            <span><i class="fa-regular fa-clock mr-1"></i>${task.time}</span>
                        </p>
                    </div>
                </div>
                <button data-id="${id}" class="delete-task-btn text-gray-500 hover:text-red-400 text-xs font-semibold md:opacity-0 group-hover:opacity-100 transition px-2 py-1">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            taskList.appendChild(row);
        });

        if(document.getElementById('totalTasksCount')) document.getElementById('totalTasksCount').textContent = total;
        if(document.getElementById('completedTasksCount')) document.getElementById('completedTasksCount').textContent = completedCount;
        if(document.getElementById('pendingTasksCount')) document.getElementById('pendingTasksCount').textContent = pendingCount;
        
        const badgeTasks = document.getElementById('sideBadgeTasks') || document.querySelector('aside span.bg-\\[\\#252836\\]');
        if (badgeTasks) badgeTasks.textContent = pendingCount;

        if (taskList.children.length === 0) {
            taskList.innerHTML = `<p class="text-gray-500 text-xs text-center py-8">No specific tasks created for your account yet.</p>`;
        }
        attachDynamicItemListeners();
    }, (error) => {
        console.error("Firestore loading error. Check if Index is deploying:", error);
    });
}

function attachDynamicItemListeners() {
    document.querySelectorAll('.task-toggle-checkbox').forEach(box => {
        box.onchange = async (e) => {
            const targetId = e.target.getAttribute('data-id');
            try {
                await updateDoc(doc(db, "tasks", targetId), { completed: e.target.checked });
            } catch (err) { console.error("Task modification failed:", err); }
        };
    });

    document.querySelectorAll('.delete-task-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const targetId = e.currentTarget.getAttribute('data-id');
            if (confirm("Permanently delete this task item?")) {
                try { await deleteDoc(doc(db, "tasks", targetId)); } catch (err) { console.error("Deletion failed:", err); }
            }
        };
    });
}

// --- OTP FIELD NAVIGATION ROUTINES ---
function setupOtpInputsBehavior() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach((box, idx) => {
        box.oninput = (e) => {
            box.value = box.value.replace(/[^0-9]/g, '');
            if (box.value.length === 1 && idx < boxes.length - 1) {
                boxes[idx + 1].focus(); 
            }
        };
        box.onkeydown = (e) => {
            if (e.key === "Backspace" && box.value.length === 0 && idx > 0) {
                boxes[idx - 1].focus(); 
            }
        };
    });

    const cancelOtpBtn = document.getElementById('cancelOtpBtn');
    if (cancelOtpBtn) {
        cancelOtpBtn.onclick = () => {
            document.getElementById('otpModal').classList.add('hidden');
            systemGeneratedOtp = null;
            pendingRegistrationData = null;
            boxes.forEach(b => b.value = '');
        };
    }

    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    if (verifyOtpBtn) {
        verifyOtpBtn.onclick = async () => {
            let combinedUserEntry = "";
            boxes.forEach(b => combinedUserEntry += b.value);

            if (combinedUserEntry.length !== 6) {
                return alert("Please enter the complete 6-digit verification code.");
            }

            if (combinedUserEntry === String(systemGeneratedOtp)) {
                try {
                    verifyOtpBtn.textContent = "Verifying...";
                    verifyOtpBtn.disabled = true;
                    
                    if (pendingRegistrationData.mode === 'create') {
                        await createUserWithEmailAndPassword(auth, pendingRegistrationData.email, pendingRegistrationData.password);
                    } else {
                        await signInWithEmailAndPassword(auth, pendingRegistrationData.email, pendingRegistrationData.password);
                    }
                    
                    document.getElementById('otpModal').classList.add('hidden');
                    boxes.forEach(b => b.value = '');
                } catch (error) {
                    alert("Authentication Failed: " + error.message);
                } finally {
                    verifyOtpBtn.textContent = "Verify Securely";
                    verifyOtpBtn.disabled = false;
                }
            } else {
                alert("Incorrect Security OTP. Please re-check your email.");
            }
        };
    }
}

// --- LOGIN INTERFACE EVENT BINDINGS ---
function setupLoginInterfaceListeners() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const agreeCheck = document.getElementById('agreeCheck');
    
    const termsLink = document.getElementById('termsLink');
    const termsModal = document.getElementById('termsModal');
    const closeTermsBtn = document.getElementById('closeTermsBtn');
    const acceptTermsBtn = document.getElementById('acceptTermsBtn');

    if (termsLink && termsModal) {
        termsLink.onclick = (e) => { e.preventDefault(); termsModal.classList.remove('hidden'); };
        const hideModal = () => { termsModal.classList.add('hidden'); };
        if (closeTermsBtn) closeTermsBtn.onclick = hideModal;
        if (acceptTermsBtn) {
            acceptTermsBtn.onclick = () => { if (agreeCheck) agreeCheck.checked = true; hideModal(); };
        }
    }

    // UTILITY: Dispatches the real OTP email using the EmailJS integration
    const sendOtpViaEmail = (recipientEmail, otpCode, actionButton) => {
        // --- CONFIGURE YOUR ACCOUNT IDs HERE ---
        const SERVICE_ID = "service_u4kqk8s"; // From the 'Email Services' tab
        const TEMPLATE_ID = "template_enyyyzs"; // From the 'Email Templates' tab

        const templateParams = {
            to_email: recipientEmail,
            otp_code: otpCode  // <--- This is the specific name of your variable!
      };

        emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams)
            .then(() => {
                alert(`A secure verification code has been dispatched to ${recipientEmail}. Please check your inbox or spam folder.`);
                document.getElementById('otpModal').classList.remove('hidden');
                const firstBox = document.querySelector('.otp-box');
                if (firstBox) firstBox.focus();
            })
            .catch((err) => {
                alert("Failed to send verification email. Error details: " + JSON.stringify(err));
            })
            .finally(() => {
                actionButton.textContent = pendingRegistrationData.mode === 'create' ? "Create Account" : "Login";
                actionButton.disabled = false;
            });
    };

    if (createAccBtn) {
        const newCreateBtn = createAccBtn.cloneNode(true); createAccBtn.parentNode.replaceChild(newCreateBtn, createAccBtn);
        newCreateBtn.onclick = (e) => {
            e.preventDefault();
            if (!agreeCheck || !agreeCheck.checked) return alert("You must read and agree to the Terms & Conditions to create an account.");
            const cleanEmail = emailInput.value.trim(); const cleanPassword = passwordInput.value.trim();
            if (!cleanEmail || !cleanPassword) return alert("Please fill in email and password fields.");
            if (cleanPassword.length < 6) return alert("Password must be at least 6 characters long.");

            newCreateBtn.textContent = "Sending Email Verification...";
            newCreateBtn.disabled = true;

            systemGeneratedOtp = Math.floor(100000 + Math.random() * 900000);
            pendingRegistrationData = { email: cleanEmail, password: cleanPassword, mode: 'create' };

            sendOtpViaEmail(cleanEmail, systemGeneratedOtp, newCreateBtn);
        };
    }

    if (loginBtn) {
        const newLoginBtn = loginBtn.cloneNode(true); loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        newLoginBtn.onclick = (e) => {
            e.preventDefault();
            const cleanEmail = emailInput.value.trim(); const cleanPassword = passwordInput.value.trim();
            if (!cleanEmail || !cleanPassword) return alert("Please fill in email and password fields.");

            newLoginBtn.textContent = "Sending Login Code...";
            newLoginBtn.disabled = true;

            systemGeneratedOtp = Math.floor(100000 + Math.random() * 900000);
            pendingRegistrationData = { email: cleanEmail, password: cleanPassword, mode: 'login' };

            sendOtpViaEmail(cleanEmail, systemGeneratedOtp, newLoginBtn);
        };
    }
}