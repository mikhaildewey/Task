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

// --- UNIVERSAL URL ROUTER UTILITY (BUILT FOR GITHUB PAGES) ---
function safeRedirect(targetPage) {
    const currentURL = window.location.href;
    const urlObj = new URL(currentURL);
    const pathSegments = urlObj.pathname.split('/');
    
    pathSegments[pathSegments.length - 1] = targetPage;
    urlObj.pathname = pathSegments.join('/');
    
    window.location.replace(urlObj.toString());
}

// --- CENTRAL AUTH STATE ROUTER PIPELINE ---
onAuthStateChanged(auth, (user) => {
    const currentPath = window.location.pathname.toLowerCase();
    
    if (user) {
        if (currentPath.includes("index.html") || currentPath.includes("login.html") || currentPath.endsWith("/")) {
            safeRedirect("dashboard.html");
        }
        
        if (addTaskBtn) {
            const emailDisplay = document.getElementById('userEmail') || document.querySelector('.text-sm.text-gray-400');
            if (emailDisplay) emailDisplay.textContent = user.email;
            initClockUtilities();
            setupRealtimeTasks(user.email); 
            setupDashboardInterfaceListeners();
            injectDynamicFeatureModals(); 
        }
    } else {
        if (currentPath.includes("dashboard.html")) {
            safeRedirect("index.html");
        }
        
        if (currentPath.includes("index.html") || currentPath.endsWith("/") || currentPath === "") {
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
    console.log("Setting up dashboard interface listeners...");
    
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const targetBoard = document.getElementById('priorityTasksBoard');
    const addTaskBtnElement = document.getElementById('addTaskBtn');

    console.log("Dashboard elements found:", {
        mobileMenuBtn: !!mobileMenuBtn,
        sidebar: !!sidebar,
        targetBoard: !!targetBoard,
        addTaskBtn: !!addTaskBtnElement
    });

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

    const logoutBtnElement = document.getElementById('logoutBtn');
    if (logoutBtnElement) {
        logoutBtnElement.onclick = async () => {
            try {
                if (snapshotUnsubscribe) {
                    snapshotUnsubscribe();
                    snapshotUnsubscribe = null;
                }
                await signOut(auth);
                safeRedirect("index.html");
            } catch (err) {
                console.error("Logout navigation failure:", err);
                safeRedirect("index.html");
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

    if (addTaskBtnElement) {
        addTaskBtnElement.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!auth.currentUser) {
                alert("You must be logged in to add tasks.");
                return;
            }

            const title = prompt("Enter task title:");
            if (!title || !title.trim()) return;
            
            const categoryInput = prompt("Select category:\n\nType 'Work' or 'Personal'", "Work");
            let finalCategory = "Work";
            if (categoryInput && categoryInput.toLowerCase() === 'personal') {
                finalCategory = "Personal";
            }

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            try {
                await addDoc(collection(db, "tasks"), {
                    userEmail: auth.currentUser.email, 
                    title: title.trim(),
                    category: finalCategory,
                    time: timeStr,
                    completed: false,
                    createdAt: new Date()
                });
                alert(`✓ Task "${title.trim()}" created successfully!`);
            } catch (error) {
                alert("Error creating task: " + error.message);
            }
        };
    }
}

// --- DATA READ QUERY RENDERING PIPELINE STREAM ---
function setupRealtimeTasks(userEmail) {
    if (snapshotUnsubscribe) snapshotUnsubscribe(); 

    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    try {
        const q = query(collection(db, "tasks"), where("userEmail", "==", userEmail));

        snapshotUnsubscribe = onSnapshot(q, (snapshot) => {
            taskList.innerHTML = '';
            cachedTasksArray = []; 
            let total = 0, completedCount = 0, pendingCount = 0;

            const allTasks = [];
            snapshot.forEach((docSnapshot) => {
                const task = docSnapshot.data();
                const id = docSnapshot.id;
                allTasks.push({ id, ...task });
            });

            allTasks.sort((a, b) => {
                const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
                const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
                return bTime - aTime;
            });

            allTasks.forEach((task) => {
                const id = task.id;
                cachedTasksArray.push(task);

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
        });
    } catch (error) {
        console.error("Error setting up real-time tasks query:", error);
    }
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
    const createAccBtnEl = document.getElementById('createAccBtn');
    const loginBtnEl = document.getElementById('loginBtn');
    
    const termsLink = document.getElementById('termsLink');
    const termsModal = document.getElementById('termsModal');
    const closeTermsBtn = document.getElementById('closeTermsBtn');
    const acceptTermsBtn = document.getElementById('acceptTermsBtn');

    // =========================================================
    // HIDE/UNHIDE & LIVE PASSWORD INDICATOR STRENGTH TRACKING
    // =========================================================
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const eyeIcon = document.getElementById('eyeIcon');
    
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    
    const ruleLength = document.getElementById('ruleLength');
    const ruleUppercase = document.getElementById('ruleUppercase');
    const ruleSpecial = document.getElementById('ruleSpecial');

    if (togglePasswordBtn && passwordInput && eyeIcon) {
        togglePasswordBtn.onclick = (e) => {
            e.preventDefault();
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.className = "fa-solid fa-eye-slash";
            } else {
                passwordInput.type = 'password';
                eyeIcon.className = "fa-solid fa-eye";
            }
        };
    }

    if (passwordInput) {
        passwordInput.oninput = () => {
            const val = passwordInput.value;

            // Rules Conditions Verification Check
            const hasLength = val.length >= 6;
            const hasUppercase = /[A-Z]/.test(val);
            const hasNoSpecial = /^[a-zA-Z0-9]*$/.test(val); // Strict Alpha-Numeric Check (Bawal Special Chars)

            // Length checklist rendering update
            if (hasLength) {
                ruleLength.className = "text-[11px] text-emerald-400 flex items-center gap-1.5";
                ruleLength.querySelector('i').className = "fa-solid fa-circle-check text-[10px]";
            } else {
                ruleLength.className = "text-[11px] text-red-400 flex items-center gap-1.5";
                ruleLength.querySelector('i').className = "fa-solid fa-circle-xmark text-[10px]";
            }

            // Uppercase validation check rendering update
            if (hasUppercase) {
                ruleUppercase.className = "text-[11px] text-emerald-400 flex items-center gap-1.5";
                ruleUppercase.querySelector('i').className = "fa-solid fa-circle-check text-[10px]";
            } else {
                ruleUppercase.className = "text-[11px] text-red-400 flex items-center gap-1.5";
                ruleUppercase.querySelector('i').className = "fa-solid fa-circle-xmark text-[10px]";
            }

            // Special character restriction check rendering update
            if (hasNoSpecial || val === "") {
                ruleSpecial.className = "text-[11px] text-emerald-400 flex items-center gap-1.5";
                ruleSpecial.querySelector('i').className = "fa-solid fa-circle-check text-[10px]";
            } else {
                ruleSpecial.className = "text-[11px] text-red-400 flex items-center gap-1.5";
                ruleSpecial.querySelector('i').className = "fa-solid fa-circle-xmark text-[10px]";
            }

            // Strength Metric Score Calculation Block
            let score = 0;
            if (val.length > 0) score += 1;
            if (hasLength) score += 1;
            if (hasUppercase) score += 1;
            if (hasNoSpecial && val.length > 0) score += 1;

            // Color status interface renderer pipeline
            if (val.length === 0) {
                strengthBar.style.width = "0%";
                strengthText.textContent = "Strength: Empty";
                strengthText.className = "text-[10px] text-gray-500 mt-1 font-medium";
            } else if (!hasNoSpecial) {
                // Instantly turn red if illegal special characters are typed
                strengthBar.style.width = "25%";
                strengthBar.className = "h-full bg-red-500 transition-all duration-300";
                strengthText.textContent = "Strength: Invalid Characters!";
                strengthText.className = "text-[10px] text-red-400 mt-1 font-medium";
            } else if (score <= 2) {
                strengthBar.style.width = "33%";
                strengthBar.className = "h-full bg-red-500 transition-all duration-300";
                strengthText.textContent = "Strength: Weak";
                strengthText.className = "text-[10px] text-red-400 mt-1 font-medium";
            } else if (score === 3) {
                strengthBar.style.width = "66%";
                strengthBar.className = "h-full bg-amber-500 transition-all duration-300";
                strengthText.textContent = "Strength: Medium";
                strengthText.className = "text-[10px] text-amber-400 mt-1 font-medium";
            } else if (score === 4) {
                strengthBar.style.width = "100%";
                strengthBar.className = "h-full bg-emerald-500 transition-all duration-300";
                strengthText.textContent = "Strength: Strong & Secure";
                strengthText.className = "text-[10px] text-emerald-400 mt-1 font-medium";
            }
        };
    }

    // Helper to validate password criteria rule before allowing form submit triggers
    const isPasswordInvalid = (passValue) => {
        const hasLength = passValue.length >= 6;
        const hasUppercase = /[A-Z]/.test(passValue);
        const hasNoSpecial = /^[a-zA-Z0-9]*$/.test(passValue);
        return (!hasLength || !hasUppercase || !hasNoSpecial);
    };

    // Terms modal handlers
    if (termsLink && termsModal) {
        termsLink.onclick = (e) => { 
            e.preventDefault(); 
            termsModal.classList.remove('hidden'); 
        };
    }
    
    if (closeTermsBtn && termsModal) {
        closeTermsBtn.onclick = () => { 
            termsModal.classList.add('hidden'); 
        };
    }
    
    if (acceptTermsBtn && termsModal && agreeCheck) {
        acceptTermsBtn.onclick = () => { 
            agreeCheck.checked = true; 
            termsModal.classList.add('hidden'); 
        };
    }

    const sendOtpViaEmail = async (recipientEmail, otpCode, mode) => {
        const SERVICE_ID = "service_u4kqk8s"; 
        const TEMPLATE_ID = "template_enyyyzs";

        const templateParams = {
            to_email: recipientEmail,
            otp_code: otpCode
        };

        try {
            const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
            console.log("Email sent successfully:", response);
            alert(`Verification code sent to ${recipientEmail}. Check your email!`);
            
            const otpModal = document.getElementById('otpModal');
            if (otpModal) {
                otpModal.classList.remove('hidden');
                const firstBox = document.querySelector('.otp-box');
                if (firstBox) firstBox.focus();
            }
        } catch (error) {
            console.error("Email send failed:", error);
            alert("Failed to send verification email. Please try again.");
        } finally {
            if (createAccBtnEl) {
                createAccBtnEl.textContent = "Create Account";
                createAccBtnEl.disabled = false;
            }
            if (loginBtnEl) {
                loginBtnEl.textContent = "Login";
                loginBtnEl.disabled = false;
            }
        }
    };

    // Create Account handler
    if (createAccBtnEl) {
        createAccBtnEl.onclick = (e) => {
            e.preventDefault();
            
            if (!agreeCheck || !agreeCheck.checked) {
                alert("You must read and agree to the Terms & Conditions to create an account.");
                return;
            }
            
            const cleanEmail = emailInput.value.trim();
            const cleanPassword = passwordInput.value.trim();
            
            if (!cleanEmail || !cleanPassword) {
                alert("Please fill in email and password fields.");
                return;
            }
            
            // BLOCKS REGISTRATION SUBMIT IF USER BROKE CRITERIA RULES
            if (isPasswordInvalid(cleanPassword)) {
                alert("Please fix your password rules before proceeding!\n\n• Minimum 6 characters\n• Must have an Uppercase character\n• No special characters allowed");
                return;
            }

            createAccBtnEl.textContent = "Sending Email Verification...";
            createAccBtnEl.disabled = true;

            systemGeneratedOtp = Math.floor(100000 + Math.random() * 900000);
            pendingRegistrationData = { email: cleanEmail, password: cleanPassword, mode: 'create' };

            sendOtpViaEmail(cleanEmail, systemGeneratedOtp, 'create');
        };
    }

    // Login handler
    if (loginBtnEl) {
        loginBtnEl.onclick = (e) => {
            e.preventDefault();
            
            const cleanEmail = emailInput.value.trim();
            const cleanPassword = passwordInput.value.trim();
            
            if (!cleanEmail || !cleanPassword) {
                alert("Please fill in email and password fields.");
                return;
            }

            // BLOCKS LOGIN SUBMIT IF USER BROKE CRITERIA RULES
            if (isPasswordInvalid(cleanPassword)) {
                alert("The entered password does not match system validation formatting constraints!\n\n• Minimum 6 characters\n• Must have an Uppercase character\n• No special characters allowed");
                return;
            }

            loginBtnEl.textContent = "Sending Login Code...";
            loginBtnEl.disabled = true;

            systemGeneratedOtp = Math.floor(100000 + Math.random() * 900000);
            pendingRegistrationData = { email: cleanEmail, password: cleanPassword, mode: 'login' };

            sendOtpViaEmail(cleanEmail, systemGeneratedOtp, 'login');
        };
    }
}