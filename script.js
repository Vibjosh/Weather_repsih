// Function to show a modal
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
  }
}

// Function to hide a modal
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// Attach event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Modal trigger buttons
  const signInBtn = document.getElementById('signInBtn');
  const registerBtn = document.getElementById('registerBtn');

  if (signInBtn) {
    signInBtn.addEventListener('click', () => openModal('signInModal'));
  }

  if (registerBtn) {
    registerBtn.addEventListener('click', () => openModal('registerModal'));
  }

  // Close buttons (with data-close attribute)
  const closeButtons = document.querySelectorAll('.close-btn');
  closeButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const modalId = e.target.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  // Close modal when clicking on the dark backdrop
  window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay')) {
      event.target.style.display = 'none';
    }
  });

  // Handle Weather Report Submission
  const weatherForm = document.getElementById('weatherReportForm');
  if (weatherForm) {
    weatherForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const district = document.getElementById('district').value.trim();
      const state = document.getElementById('state').value.trim();
      const condition = document.getElementById('weatherType').value;
      const severity = document.getElementById('severity').value;

      alert(
        `Observation Logged Successfully!\n\nLocation: ${district}, ${state}\nCondition: ${condition}\nSeverity: ${severity}\n\nYour data has been queued for verification.`
      );

      weatherForm.reset();
    });
  }

  // Handle Sign In submission
  const signInForm = document.getElementById('signInForm');
  if (signInForm) {
    signInForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Sign in successful! Welcome back.');
      closeModal('signInModal');
      signInForm.reset();
    });
  }

  // Handle Registration submission
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Registration successful! You can now log verified weather alerts.');
      closeModal('registerModal');
      registerForm.reset();
    });
  }
})