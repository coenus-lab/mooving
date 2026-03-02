const classesContainer = document.querySelector('#classes');
const classSelect = document.querySelector('#class-select');
const membershipForm = document.querySelector('#membership-form');
const bookingForm = document.querySelector('#booking-form');
const membershipMsg = document.querySelector('#membership-msg');
const bookingMsg = document.querySelector('#booking-msg');

function renderClasses(classes) {
  classesContainer.innerHTML = '';
  classSelect.innerHTML = '';

  classes.forEach((classItem) => {
    const card = document.createElement('div');
    card.innerHTML = `
      <strong>${classItem.day} ${classItem.time}</strong>
      <span>${classItem.name} · Coach ${classItem.coach}</span>
      <span>${classItem.remaining} spots left</span>
    `;
    classesContainer.append(card);

    const option = document.createElement('option');
    option.value = classItem.id;
    option.textContent = `${classItem.day} ${classItem.time} - ${classItem.name} (${classItem.remaining} left)`;
    option.disabled = classItem.remaining <= 0;
    classSelect.append(option);
  });
}

async function loadClasses() {
  const response = await fetch('/api/classes');
  const classes = await response.json();
  renderClasses(classes);
}

membershipForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  membershipMsg.textContent = 'Creating membership...';
  const payload = Object.fromEntries(new FormData(membershipForm).entries());

  const response = await fetch('/api/memberships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    membershipMsg.textContent = data.error || 'Membership failed.';
    return;
  }

  membershipMsg.textContent = `Membership active! Welcome ${data.membership.name}.`;
  membershipForm.reset();
});

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  bookingMsg.textContent = 'Booking class...';
  const payload = Object.fromEntries(new FormData(bookingForm).entries());

  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    bookingMsg.textContent = data.error || 'Booking failed.';
    return;
  }

  bookingMsg.textContent = 'Class booked! A confirmation email has been triggered.';
  bookingForm.reset();
  loadClasses();
});

loadClasses();
