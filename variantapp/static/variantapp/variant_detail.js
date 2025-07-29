/**
 * Sorts the table rows based on the severity of the "Impact" column.
 * The severity order is defined as: HIGH > MODERATE > LOW > MODIFIER > -
 *
 * @param {number} columnIndex - The index of the Impact column in the table.
 * @param {string} order - Sort order: 'asc' for ascending, 'desc' for descending.
 * @param {HTMLElement} button - The button element clicked (for updating aria-pressed).
 */
function sortImpactBySeverity(columnIndex, order = 'asc', button = null) {
  // Define the severity ranking to map text values to numeric values for sorting.
  const severityOrder = {
    "HIGH": 4, // Highest severity
    "MODERATE": 3,
    "LOW": 2,
    "MODIFIER": 1,
    "-": 0 // No impact or unknown
  };

  // Get the table and its tbody element.
  const table = document.getElementById('resultTable');
  const tbody = table.tBodies[0];
  // Convert the HTMLCollection of rows to an array for easier sorting.
  const rowsArray = Array.from(tbody.rows);

  /**
   * Helper function to get the numeric severity value of a cell.
   * @param {HTMLElement} row - The table row.
   * @param {number} index - The column index.
   * @returns {number} The numeric severity value, or 0 if not found.
   */
  const getSeverityValue = (row, index) => {
    let cell = row.cells[index];
    if (!cell) return 0;
    // Get the text content, trim it, convert to uppercase, and get its severity value.
    const text = cell.textContent.trim().toUpperCase();
    return severityOrder[text] || 0;
  };

  // Sort the rows array based on the severity values.
  rowsArray.sort((a, b) => {
    const valA = getSeverityValue(a, columnIndex);
    const valB = getSeverityValue(b, columnIndex);

    // Apply ascending or descending order based on the 'order' parameter.
    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0; // If values are equal, maintain original order.
  });

  // Clear the existing table body.
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }


  // Append the sorted rows back to the table body.
  rowsArray.forEach(row => tbody.appendChild(row));

  // Update aria-pressed attribute for accessibility if a button is provided.
  if (button) {
    const group = button.closest('.sort-buttons');
    if (group) {
      // Set all buttons in the group to aria-pressed="false".
      group.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
      // Set the clicked button to aria-pressed="true".
      button.setAttribute('aria-pressed', 'true');
    }
  }
}

/**
 * Sort HTML table by a specific column index.
 * @param {number} columnIndex - The index of the column to sort (0-based).
 * @param {'asc'|'desc'} order - Sort order: 'asc' for ascending, 'desc' for descending.
 * @param {HTMLElement} button - The button element clicked (to update aria-pressed).
 */
function sortTableByColumn(columnIndex, order = 'asc', button = null) {
  // Get the table and its tbody element.
  const table = document.getElementById('resultTable');
  const tbody = table.tBodies[0];
  // Convert the HTMLCollection of rows to an array for easier sorting.
  const rowsArray = Array.from(tbody.rows);

  /**
   * Helper function to get the cell value for comparison.
   * It attempts to parse as a float for numeric sorting, otherwise treats as string.
   * @param {HTMLElement} row - The table row.
   * @param {number} index - The column index.
   * @returns {string|number} The parsed cell value.
   */
  const getCellValue = (row, index) => {
    let cell = row.cells[index];
    if (!cell) return '';

    const text = cell.textContent.trim().replace(/,/g, ''); // Remove commas for number parsing.
    const num = parseFloat(text);
    return isNaN(num) ? text.toLowerCase() : num; // Return number if valid, otherwise lowercase string.
  };

  // Sort the rows array based on the cell values.
  rowsArray.sort((a, b) => {
    const valA = getCellValue(a, columnIndex);
    const valB = getCellValue(b, columnIndex);

    // Apply ascending or descending order based on the 'order' parameter.
    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0; // If values are equal, maintain original order.
  });

  // Clear the existing table body.
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
  }

  // Append the sorted rows back to the table body.
  rowsArray.forEach(row => tbody.appendChild(row));

  // Update aria-pressed attribute for accessibility if a button is provided.
  if (button) {
    const group = button.closest('.sort-buttons');
    if (group) {
      // Set all buttons in the group to aria-pressed="false".
      group.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
      // Set the clicked button to aria-pressed="true".
      button.setAttribute('aria-pressed', 'true');
    }
  }
}

// Current filter type for patient data: 'all', 'hetero', or 'homo'.
let currentFilter = "all";
// Current variant type: 'SR' (Short Read) or 'LR' (Long Read).
let currentType = "SR";

// Cache structure for storing preloaded patient data.
// It's organized by variant type (SR/LR), then by a unique key (variant ID),
// and then by filter type (all, homo, hetero), each containing paginated data.
const cache = {
  SR: {},
  LR: {}
};

// Debounce timer variable for the live search input.
let debounceTimer = null;
const DEBOUNCE_DELAY = 300; // Milliseconds delay before triggering search after typing stops.

// Minimum loading display time in milliseconds
const MIN_LOADING_TIME = 500;

window.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("patient-search");

  if (searchInput) {
    // Add an event listener for input changes to the search box.
    searchInput.addEventListener("input", () => {
      const searchTerm = searchInput.value.trim().toLowerCase();
      // Clear any existing debounce timer.
      if (debounceTimer) clearTimeout(debounceTimer);

      // Set a new debounce timer.
      debounceTimer = setTimeout(() => {
        const currentKey = document.getElementById("popup").dataset.currentKey;
        const currentType = document.getElementById("popup").dataset.currentType || "SR";
        if (!currentKey) return; // If no current key, do nothing.

        // Reset to page 1 on a new search term.
        renderPatientsFromCacheOrFilter(currentKey, 1, currentFilter, searchTerm, currentType);
      }, DEBOUNCE_DELAY);
    });
  }

  // Close the popup on Escape key press.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopup();
  });

  // Close the popup if clicking outside of popup and not on view or pagination buttons.
  document.addEventListener("click", (event) => {
    const popup = document.getElementById("popup");
    const isInsidePopup = popup.contains(event.target);
    const isViewBtn = event.target.classList.contains("view-btn");
    const isPagination = event.target.classList.contains("pagination-btn");

    if (popup.style.display === "block" && !isInsidePopup && !isViewBtn && !isPagination) {
      closePopup();
    }
  });
});

/**
 * Show popup UI element and focus input.
 */
function showPopupUI() {
  const popup = document.getElementById("popup");
  if (!popup) return;
  popup.style.display = "block";
  const searchInput = document.getElementById("patient-search");
  if (searchInput) searchInput.focus();
}

/**
 * Show popup and preload all patient data.
 * Enforces minimum loading time display.
 * @param {string} unique_key
 * @param {string} type - "SR" or "LR"
 */
function showPopup(unique_key, type = "SR") {
  currentFilter = "all";
  currentType = type;

  const searchInput = document.getElementById("patient-search");
  if (searchInput) searchInput.value = "";

  const popup = document.getElementById("popup");
  popup.dataset.currentKey = unique_key;
  popup.dataset.currentType = type;

  const titleText = type === "SR" || type === "LR" ? type : "Unknown";
  document.getElementById("popup-title").textContent = `Patient Information (${titleText})`;

  // Show loading indicator immediately
  document.getElementById("popup-content").innerHTML = `
  <div class="popup-loading-container">
    <div class="spinner"></div>
    <div class="loading-text">Loading…</div>
  </div>`;
  showPopupUI();

  if (
    cache[type] &&
    cache[type][unique_key] &&
    cache[type][unique_key]["all"] &&
    cache[type][unique_key]["all"].pages
  ) {
    // Use cache and render directly after a short delay to keep UX smooth
    setTimeout(() => {
      renderPatientsFromCacheOrFilter(unique_key, 1, currentFilter, "", type);
    }, MIN_LOADING_TIME);
    return;
  }

  let preloadUrl = "";
  if (type === "SR") {
    preloadUrl = `/get_patients?unique_key=${encodeURIComponent(unique_key)}&preload=true`;
  } else if (type === "LR") {
    preloadUrl = `/get_patients_longread_ajax?variant_id=${encodeURIComponent(unique_key)}&preload=true`;
  }

  const loadStartTime = Date.now();

  fetch(preloadUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Failed to preload patient data: ${res.status}`);
      return res.json();
    })
    .then(data => {
      if (!cache[type]) cache[type] = {};
      cache[type][unique_key] = {};

      ["all", "hetero", "homo"].forEach(filterType => {
        const resData = data.result && data.result[filterType] ? data.result[filterType] : {
          pages: [], total: 0, total_pages: 0
        };
        cache[type][unique_key][filterType] = {
          pages: resData.pages || [],
          homoCount: data.homo_count || 0,
          heteroCount: data.hetero_count || 0,
          totalPages: resData.total_pages || 0,
          totalMatched: resData.total || 0,
        };
      });

      // Ensure loading shown minimum time
      const elapsed = Date.now() - loadStartTime;
      const delay = Math.max(MIN_LOADING_TIME - elapsed, 0);

      setTimeout(() => {
        renderPatientsFromCacheOrFilter(unique_key, 1, currentFilter, "", type);
      }, delay);
    })
    .catch(err => {
      const elapsed = Date.now() - loadStartTime;
      const delay = Math.max(MIN_LOADING_TIME - elapsed, 0);

      setTimeout(() => {
        document.getElementById("popup-content").innerHTML = `<i>Error loading patient data: ${err.message}</i>`;
      }, delay);
    });
}

/**
 * Render patients from cache with optional filtering by searchTerm.
 */
function renderPatientsFromCacheOrFilter(unique_key, page, filterType, searchTerm, type = "SR") {
  if (!cache[type] || !cache[type][unique_key] || !cache[type][unique_key][filterType]) return;

  const filterData = cache[type][unique_key][filterType];
  const allPatients = filterData.pages.flat();

  if (!searchTerm) {
    const patientsPage = filterData.pages[page - 1] || [];
    renderPatientList(
      patientsPage,
      cache[type][unique_key]["all"].homoCount,
      cache[type][unique_key]["all"].heteroCount,
      page,
      filterData.totalPages,
      unique_key,
      filterData.totalMatched,
      "",
      type
    );
    renderPaginationControls(page, filterData.totalPages, unique_key, type);
    updatePaginationInfo(patientsPage.length);
    return;
  }

  const filteredPatients = allPatients.filter(p =>
    (p.patient_id && p.patient_id.toLowerCase().includes(searchTerm)) ||
    (p.genotype && p.genotype.toLowerCase().includes(searchTerm)) ||
    (p.gender && p.gender.toLowerCase() === searchTerm) ||
    (p.diagnosis && p.diagnosis.toLowerCase().includes(searchTerm))
  );

  const perPage = 50;
  const totalFiltered = filteredPatients.length;
  const totalPages = Math.ceil(totalFiltered / perPage);
  const currentPage = Math.min(Math.max(page, 1), totalPages || 1);
  const startIndex = (currentPage - 1) * perPage;
  const patientsPage = filteredPatients.slice(startIndex, startIndex + perPage);

  renderPatientList(
    patientsPage,
    cache[type][unique_key]["all"].homoCount,
    cache[type][unique_key]["all"].heteroCount,
    currentPage,
    totalPages,
    unique_key,
    totalFiltered,
    searchTerm,
    type
  );
  renderPaginationControls(currentPage, totalPages, unique_key, type);
  updatePaginationInfo(patientsPage.length);
}

/**
 * Render patient list with highlights.
 */
function renderPatientList(patients, homoCount, heteroCount, currentPage, totalPages, unique_key, totalMatched, searchTerm = "", type = "SR") {
  const container = document.getElementById("popup-content");

  container.innerHTML = `
    <div class="summary-box">
      <div class="summary-item" id="sum" onclick="toggleFilter('all', event)">
        <span class="summary-label">All :</span>
        <span class="summary-value">${totalMatched}</span>
      </div>
      <div class="summary-item" id="filter-hetero" onclick="toggleFilter('hetero', event)">
        <span class="summary-label">Heterozygous :</span>
        <span class="summary-value">${heteroCount}</span>
      </div>
      <div class="summary-item" id="filter-homo" onclick="toggleFilter('homo', event)">
        <span class="summary-label">Homozygous :</span>
        <span class="summary-value">${homoCount}</span>
      </div>
    </div>
    <table aria-label="Patient list" role="grid">
      <thead>
        <tr>
          <th>Patient ID</th>
          <th>Genotype</th>
          <th>Gender</th>
          <th>Diagnosis</th>
        </tr>
      </thead>
      <tbody id="patient-tbody"></tbody>
    </table>
    <div id="pagination-controls">
      <div id="pagination-buttons"></div>
      <div id="pagination-info" data-current-page="${currentPage}" style="margin-top: 5px;"></div>
    </div>
  `;

  const searchInput = document.getElementById("patient-search");
  if (searchInput) {
    searchInput.value = searchTerm;
  }

  const tbody = document.getElementById("patient-tbody");

  if (!patients || patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;"><i>No patients found for this filter.</i></td></tr>`;
  } else {
    tbody.innerHTML = patients
      .map(p => `
        <tr>
          <td>${highlightText(p.patient_id, searchTerm)}</td>
          <td>${highlightText(p.genotype, searchTerm)}</td>
          <td>${highlightText(p.gender, searchTerm)}</td>
          <td>${highlightText(p.diagnosis, searchTerm)}</td>
        </tr>
      `)
      .join("");
  }

  document.getElementById("sum").classList.toggle("active-filter", currentFilter === "all");
  document.getElementById("filter-hetero").classList.toggle("active-filter", currentFilter === "hetero");
  document.getElementById("filter-homo").classList.toggle("active-filter", currentFilter === "homo");
}

/**
 * Highlight matched text.
 */
function highlightText(text, searchTerm) {
  if (!searchTerm) return text;
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  return text.replace(regex, (match) => `<mark>${match}</mark>`);
}

/**
 * Update pagination info.
 */
function updatePaginationInfo(shownCount) {
  const infoDiv = document.getElementById("pagination-info");
  infoDiv.textContent = `Showing ${shownCount} patient${shownCount !== 1 ? "s" : ""} on this page.`;
}

/**
 * Render pagination buttons.
 */
function renderPaginationControls(currentPage, totalPages, unique_key, type = "SR") {
  const btnContainer = document.getElementById("pagination-buttons");

  if (totalPages <= 1) {
    btnContainer.innerHTML = "";
    return;
  }

  btnContainer.innerHTML = `
    <button class="pagination-btn" ${currentPage === 1 ? "disabled" : ""}
      onclick="renderPatientsFromCacheOrFilter('${unique_key}', ${currentPage - 1}, '${currentFilter}', document.getElementById('patient-search').value.trim().toLowerCase(), '${type}')">Previous</button>
    <span style="margin: 0 10px;">Page ${currentPage} of ${totalPages}</span>
    <button class="pagination-btn" ${currentPage === totalPages ? "disabled" : ""}
      onclick="renderPatientsFromCacheOrFilter('${unique_key}', ${currentPage + 1}, '${currentFilter}', document.getElementById('patient-search').value.trim().toLowerCase(), '${type}')">Next</button>
  `;
}

/**
 * Toggle filter and rerender.
 */
function toggleFilter(filterType, event) {
  event.stopPropagation();

  currentFilter = currentFilter === filterType ? "all" : filterType;

  const key = document.getElementById("popup").dataset.currentKey;
  const type = document.getElementById("popup").dataset.currentType || "SR";
  if (key) {
    const searchInput = document.getElementById("patient-search");
    if (searchInput) {
      searchInput.value = "";
    }
    renderPatientsFromCacheOrFilter(key, 1, currentFilter, "", type);
  }
}

/**
 * Close popup function placeholder - implement as needed.
 */
function closePopup() {
  const popup = document.getElementById("popup");
  if (popup) {
    popup.style.display = "none";
  }
}


/**
 * Closes the patient popup window and resets its state.
 */
function closePopup() {
  const popup = document.getElementById("popup");
  popup.style.display = "none"; // Hide the popup.
  document.getElementById("popup-content").innerHTML = ""; // Clear content.
  popup.dataset.currentKey = ""; // Clear stored key.
  popup.dataset.currentType = ""; // Clear stored type.
  currentFilter = "all"; // Reset filter to default.
  currentType = "SR"; // Reset type to default.

  // Clear the search input field upon closing the popup.
  const searchInput = document.getElementById("patient-search");
  if (searchInput) searchInput.value = "";
}

// --- Dragging support for popup window ---

const popup = document.getElementById("popup");
const popupHeader = document.getElementById("popup-header");

let isDragging = false; // Flag to track if dragging is in progress.
let offsetX = 0; // X-offset from mouse click to popup's left edge.
let offsetY = 0; // Y-offset from mouse click to popup's top edge.

// Add mouse down listener to the popup header to initiate dragging.
popupHeader.addEventListener("mousedown", (e) => {
  isDragging = true;
  popupHeader.classList.add("dragging"); // Add a class to indicate dragging state.

  const rect = popup.getBoundingClientRect(); // Get popup's current position and size.
  offsetX = e.clientX - rect.left; // Calculate offset X.
  offsetY = e.clientY - rect.top; // Calculate offset Y.

  // Add mousemove and mouseup listeners to the document for dragging functionality.
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

/**
 * Handles mouse movement while dragging the popup.
 * @param {MouseEvent} e - The mouse event.
 */
function onMouseMove(e) {
  if (!isDragging) return; // If not dragging, do nothing.
  // Update popup's position based on mouse movement and initial offset.
  popup.style.left = `${e.clientX - offsetX}px`;
  popup.style.top = `${e.clientY - offsetY}px`;
  popup.style.transform = "none"; // Remove any transform that might interfere with direct positioning.
}

/**
 * Handles mouse up event, ending the dragging operation.
 */
function onMouseUp() {
  isDragging = false; // Reset dragging flag.
  popupHeader.classList.remove("dragging"); // Remove dragging class.
  // Remove event listeners from the document.
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
}