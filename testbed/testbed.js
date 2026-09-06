/**
 * SIH 2026 - Problem Statement 26171 (ISRO)
 * Testbed Interactive Scripts
 */

// Tab Switching
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const target = tab.getAttribute('data-tab');
    document.getElementById(target).classList.add('active');
  });
});

// Citizen Form Submit
function submitCitizenForm() {
  const successBox = document.getElementById('formSuccessMessage');
  successBox.style.display = 'block';
  successBox.scrollIntoView({ behavior: 'smooth' });
}

// Flight Search
function searchFlights() {
  const fromCity = document.getElementById('flightFrom').value || 'Delhi (DEL)';
  const toCity = document.getElementById('flightTo').value || 'Mumbai (BOM)';
  
  const results = document.getElementById('flightResultsList');
  results.style.display = 'block';
  results.scrollIntoView({ behavior: 'smooth' });
}

function selectFlight(flightCode) {
  const confirmBox = document.getElementById('flightBookingConfirmed');
  confirmBox.style.display = 'block';
  confirmBox.innerHTML = `🎉 <strong>Flight Confirmed!</strong> Seat successfully reserved on <strong>${flightCode}</strong> with Zero PII leakage.`;
  confirmBox.scrollIntoView({ behavior: 'smooth' });
}
