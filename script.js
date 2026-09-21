 const N8N_WEBHOOK_URL =
    "https://airoperty.app.n8n.cloud/webhook/leadresi";

const AUTH_USERNAME = "admin";
const AUTH_PASSWORD = "admin123";
const AUTH_STORAGE_KEY = "leadDashboardAuthenticated";

let allLeads = [];

function showDashboard() {
    document.getElementById("authScreen").hidden = true;
    document.getElementById("dashboard").hidden = false;
    initializeDashboard();
    getLeads();
}


function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value;
    const authError = document.getElementById("authError");

    if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
        try {
            sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
            authError.textContent = "";
            showDashboard();
        } catch (error) {
            authError.textContent = "Unable to start a login session in this browser.";
            console.error("AUTH STORAGE ERROR:", error);
        }

        return;
    }

    authError.textContent = "Incorrect username or password.";
}


function handleLogout() {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.reload();
}


function initializeDashboard() {
    const searchInput = document.getElementById("searchInput");
    const refreshBtn = document.getElementById("refreshBtn");
    const leadForm = document.getElementById("leadForm");

    if (searchInput && !searchInput.dataset.initialized) {
        searchInput.addEventListener("input", searchLeads);
        searchInput.dataset.initialized = "true";
    }

    if (refreshBtn && !refreshBtn.dataset.initialized) {
        refreshBtn.addEventListener("click", getLeads);
        refreshBtn.dataset.initialized = "true";
    }

    if (leadForm && !leadForm.dataset.initialized) {
        leadForm.addEventListener("submit", submitLead);
        leadForm.dataset.initialized = "true";
    }
}

async function getLeads() {

    const table = document.getElementById("leadsTable");
    const connectionStatus =
        document.getElementById("connectionStatus");

    try {

        connectionStatus.textContent = "Connecting to n8n...";
        connectionStatus.className = "connection-status";

        table.innerHTML = `
            <tr>
                <td colspan="6" class="loading">
                    Loading leads...
                </td>
            </tr>
        `;

        console.log("================================");
        console.log("FETCHING N8N DATA");
        console.log("================================");

        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "GET",
            cache: "no-store"
        });

        console.log("HTTP STATUS:", response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        console.log("RAW DATA:", data);
        console.log("IS ARRAY:", Array.isArray(data));

        /*
        Handle different possible n8n response formats
        */

        if (Array.isArray(data)) {

            allLeads = data;

        } else if (
            data &&
            Array.isArray(data.leads)
        ) {

            allLeads = data.leads;

        } else if (
            data &&
            Array.isArray(data.data)
        ) {

            allLeads = data.data;

        } else if (
            data &&
            typeof data === "object"
        ) {

            allLeads = [data];

        } else {

            allLeads = [];
        }

        allLeads = allLeads.filter(lead => {
            if (!lead || typeof lead !== "object") {
                return false;
            }

            return Object.entries(lead).some(([key, value]) => {
                const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
                const isIdentityField =
                    normalizedKey === "name" ||
                    normalizedKey === "fullname" ||
                    normalizedKey === "phone" ||
                    normalizedKey === "email";
                const normalizedValue = String(value ?? "").trim().toLowerCase();

                return isIdentityField &&
                    normalizedValue !== "" &&
                    normalizedValue !== "-" &&
                    normalizedValue !== "null" &&
                    normalizedValue !== "undefined";
            });
        });

        console.log("FINAL LEADS:", allLeads);
        console.log("TOTAL LEADS:", allLeads.length);

        updateDashboard();

        connectionStatus.textContent =
            `Connected • ${allLeads.length} leads loaded`;

        connectionStatus.className =
            "connection-status success";

    } catch (error) {

        console.error("N8N ERROR:", error);

        allLeads = [];

        updateDashboard();

        connectionStatus.textContent =
            "Connection failed";

        connectionStatus.className =
            "connection-status error";
    }
}


function updateDashboard() {

    console.log(
        "UPDATING DASHBOARD:",
        allLeads.length
    );

    updateKPIs(allLeads);

    displayLeads(allLeads);
}


function getPackagePrice(leadCount) {
    if (leadCount <= 0) return 0;

    const fullPackages = Math.floor(leadCount / 3);
    const remainingLeads = leadCount % 3;
    const remainingPrice = remainingLeads === 2 ? 20 : remainingLeads * 10;

    return (fullPackages * 25) + remainingPrice;
}


function getLeadRevenue(lead) {
    const explicitRevenue = Number(
        lead.Revenue ??
        lead.revenue ??
        lead.Price ??
        lead.price
    );

    if (Number.isFinite(explicitRevenue)) {
        return explicitRevenue;
    }

    const leadsPerDay = Number(
        lead.LeadsPerDay ??
        lead.leadsPerDay ??
        lead["Leads Per Day"] ??
        0
    );

    return Number.isFinite(leadsPerDay) ? getPackagePrice(leadsPerDay) : 0;
}


function normalizeStatus(value) {
    return String(value ?? "")
        .toLowerCase()
        .trim()
        .replace(/[_/]+/g, " ")
        .replace(/\s*[-–—]\s*/g, " ")
        .replace(/\s+/g, " ");
}


function extractPartyValue(value, party) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    if (typeof value !== "object") {
        return value;
    }

    const nameEntry = Object.entries(value).find(([key, nestedValue]) => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normalizedParty = party.toLowerCase();

        return (
            normalizedKey === "name" ||
            normalizedKey === "fullname" ||
            normalizedKey === normalizedParty ||
            normalizedKey.startsWith(normalizedParty + "name") ||
            normalizedKey.startsWith(normalizedParty + "fullname")
        ) && nestedValue !== null && nestedValue !== undefined && nestedValue !== "";
    });

    return nameEntry ? extractPartyValue(nameEntry[1], party) : "-";
}


function getLeadParty(lead) {
    const partyKeyNames = new Set([
        "buyerseller",
        "buyerorseller",
        "leadtype",
        "leadcategory",
        "category",
        "type",
        "role",
        "side"
    ]);

    const partyEntry = Object.entries(lead).find(([key, value]) => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        const normalizedValue = String(value ?? "").toLowerCase().trim();

        return (
            (partyKeyNames.has(normalizedKey) || normalizedKey.includes("buyerorseller")) &&
            (normalizedValue === "buyer" || normalizedValue === "seller")
        );
    });

    if (partyEntry) {
        return String(partyEntry[1]).toLowerCase().trim();
    }

    const hasBuyerName = getPartyName(lead, "buyer") !== "-";
    const hasSellerName = getPartyName(lead, "seller") !== "-";

    if (hasBuyerName && !hasSellerName) return "buyer";
    if (hasSellerName && !hasBuyerName) return "seller";

    return "";
}


function getPartyName(lead, party) {
    const directValue =
        lead[`${party}Name`] ??
        lead[`${party}FullName`] ??
        lead[`${party}_name`] ??
        lead[`${party}_full_name`] ??
        lead[`${party} Name`] ??
        lead[`${party} Full Name`];

    if (directValue !== undefined && directValue !== null && directValue !== "") {
        return extractPartyValue(directValue, party);
    }

    const normalizedParty = party.toLowerCase();
    const matchingEntry = Object.entries(lead).find(([key, value]) => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        const isPartyField = normalizedKey.startsWith(normalizedParty);
        const isNameField = normalizedKey.includes("name") || normalizedKey.includes("fullname");

        return isPartyField && isNameField && value !== null && value !== undefined && value !== "";
    });

    if (matchingEntry) {
        return matchingEntry[1];
    }

    const parties = lead.parties ?? lead.Parties;
    const nestedParty = parties?.[party] ?? parties?.[party.toLowerCase()];

    if (nestedParty) {
        return extractPartyValue(nestedParty, party);
    }

    return "-";
}


function updateKPIs(leads) {

    const totalLeads = leads.length;

    const activeLeads = totalLeads;

    const leadsPerDayTotal = leads.reduce((sum, lead) => {
        const value = Number(lead.LeadsPerDay ?? lead.leadsPerDay ?? lead["Leads Per Day"] ?? 0);
        return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    const totalRevenue = leads.reduce((sum, lead) => {
        return sum + getLeadRevenue(lead);
    }, 0);
    const buyerRevenue = leads.reduce((sum, lead) => {
        return getLeadParty(lead) === "buyer" ? sum + getLeadRevenue(lead) : sum;
    }, 0);
    const sellerRevenue = leads.reduce((sum, lead) => {
        return getLeadParty(lead) === "seller" ? sum + getLeadRevenue(lead) : sum;
    }, 0);
    const totalLeadsElement = document.getElementById("totalLeads");
    const activeLeadsElement = document.getElementById("activeLeads");
    const leadsPerDayElement = document.getElementById("leadsPerDay");
    const revenueElement = document.getElementById("totalRevenue");
    const buyerRevenueElement = document.getElementById("buyerRevenue");
    const sellerRevenueElement = document.getElementById("sellerRevenue");

    if (totalLeadsElement) totalLeadsElement.textContent = totalLeads;
    if (activeLeadsElement) activeLeadsElement.textContent = activeLeads;
    if (leadsPerDayElement) leadsPerDayElement.textContent = Number(leadsPerDayTotal).toFixed(1);
    if (revenueElement) revenueElement.textContent = `$${totalRevenue}`;
    if (buyerRevenueElement) buyerRevenueElement.textContent = `$${buyerRevenue}`;
    if (sellerRevenueElement) sellerRevenueElement.textContent = `$${sellerRevenue}`;

    const leadCount = document.getElementById("leadCount");
    if (leadCount) {
        leadCount.textContent = `${totalLeads} leads`;
    }
}


function displayLeads(leads) {

    const table =
        document.getElementById("leadsTable");

    console.log(
        "DISPLAYING:",
        leads.length,
        "LEADS"
    );

    if (!leads || leads.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="7" class="loading">
                    No leads found
                </td>
            </tr>
        `;

        return;
    }


    table.innerHTML = leads.map(
        (lead, index) => {

            console.log(
                `Rendering lead ${index + 1}:`,
                lead
            );


            const name =
                lead.FullName ??
                lead.fullName ??
                lead.Name ??
                lead.name ??
                "-";

            const buyerName = getPartyName(lead, "buyer");
            const sellerName = getPartyName(lead, "seller");
            const leadParty = getLeadParty(lead);
            const displayedBuyerName = buyerName !== "-"
                ? buyerName
                : leadParty === "buyer" ? name : "-";
            const displayedSellerName = sellerName !== "-"
                ? sellerName
                : leadParty === "seller" ? name : "-";

            const phone =
                lead.Phone ??
                lead.phone ??
                "-";

            const email =
                lead.Email ??
                lead.email ??
                "-";

            const leadsPerDay =
                lead.LeadsPerDay ??
                lead.leadsPerDay ??
                lead["Leads Per Day"] ??
                "-";

            return `
                <tr>

                    <td>
                        ${escapeHTML(name)}
                    </td>

                    <td>
                        ${escapeHTML(String(displayedBuyerName))}
                    </td>

                    <td>
                        ${escapeHTML(String(displayedSellerName))}
                    </td>

                    <td>
                        ${escapeHTML(String(phone))}
                    </td>

                    <td>
                        ${escapeHTML(email)}
                    </td>

                    <td>
                        ${escapeHTML(String(leadsPerDay))}
                    </td>

                </tr>
            `;
        }
    ).join("");
}


function getStatusClass(status) {

    const value = normalizeStatus(status).replace(/\s+/g, "-");


    switch (value) {

        case "new":
        case "active":
        case "open":
        case "qualified":
        case "pending":
        case "contacted":
        case "in-progress":
            return "status-new";

        case "hot":
            return "status-hot";

        case "warm":
            return "status-warm";

        case "follow-up":
            return "status-follow-up";

        case "converted":
            return "status-converted";

        case "lost":
            return "status-lost";

        default:
            return "";
    }
}


function formatDate(date) {

    if (!date || date === "-") {
        return "-";
    }

    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
        return String(date);
    }

    return parsedDate.toLocaleDateString(
        "en-US",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    );
}


function escapeHTML(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function searchLeads() {

    const input =
        document.getElementById("searchInput");

    const search =
        input.value.toLowerCase().trim();


    if (!search) {

        displayLeads(allLeads);

        return;
    }


    const filtered =
        allLeads.filter(lead => {

            return [

                lead.FullName,
                lead.Name,
                lead.BuyerName,
                lead["Buyer Name"],
                lead.buyerName,
                lead.buyer,
                lead.SellerName,
                lead["Seller Name"],
                lead.sellerName,
                lead.seller,
                lead.Phone,
                lead.Email,
                lead.Source,
                lead.Status

            ]
                .map(value =>
                    String(value ?? "")
                        .toLowerCase()
                )
                .some(value =>
                    value.includes(search)
                );

        });


    displayLeads(filtered);
}


async function submitLead(event) {

    event.preventDefault();

    const form =
        document.getElementById("leadForm");

    if (!form) {
        return;
    }

    const fullName =
        document.getElementById("fullName").value.trim();

    const phone =
        document.getElementById("phone").value.trim();

    const email =
        document.getElementById("email").value.trim();

    const leadsPerDay =
        Number(document.getElementById("leadsPerDayInput").value);

    if (!fullName || !phone || !email || !Number.isFinite(leadsPerDay) || leadsPerDay < 1) {
        return;
    }

    const payload = {
        FullName: fullName,
        Phone: phone,
        Email: email,
        LeadsPerDay: leadsPerDay
    };

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        form.reset();

    } catch (error) {
        console.error("SUBMIT ERROR:", error);
    }
}


/*
INITIALIZE DASHBOARD
*/

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const authForm = document.getElementById("authForm");
        const logoutBtn = document.getElementById("logoutBtn");

        authForm.addEventListener("submit", handleLogin);
        logoutBtn.addEventListener("click", handleLogout);

        let isAuthenticated = false;

        try {
            isAuthenticated = sessionStorage.getItem(AUTH_STORAGE_KEY) === "true";
        } catch (error) {
            console.error("AUTH STORAGE ERROR:", error);
        }

        if (!isAuthenticated) {
            return;
        }

        console.log(
            "Lead Dashboard started"
        );

        showDashboard();


    }
);