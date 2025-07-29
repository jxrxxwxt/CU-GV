// Get canvas element and 2D drawing context for background animation
const canvas = document.getElementById("backgroundCanvas");
const ctx = canvas.getContext("2d");

let width, height;
// Function to resize canvas to fill entire browser window
function resize() {
  width = canvas.width = window.innerWidth;   // Set canvas width to window width
  height = canvas.height = window.innerHeight; // Set canvas height to window height
}

// Listen for window resize event to update canvas size dynamically
window.addEventListener("resize", resize);
resize();  // Initial resize on page load

// Load DNA image to use as floating objects in background animation
const dnaImage = new Image();
dnaImage.src = "https://www.pngmart.com/files/7/DNA-PNG-Transparent.png";

// Class representing a single floating DNA image
class FloatingDNA {
  constructor() {
    this.reset();  // Initialize random position, speed, size, and rotation
  }

  // Reset or initialize properties randomly
  reset() {
    this.x = Math.random() * width;  // Random X position within canvas width
    this.y = Math.random() * height; // Random Y position within canvas height

    // Horizontal speed: random value between -0.75 and +0.75 (left-right movement)
    this.dx = (Math.random() - 0.5) * 1.5;
    // Vertical speed: random value between -0.75 and +0.75 (up-down movement)
    this.dy = (Math.random() - 0.5) * 1.5;

    // Size between 30 and 60 pixels (random)
    this.size = 30 + Math.random() * 30;

    // Starting rotation angle in radians (0 to 2π)
    this.angle = Math.random() * 2 * Math.PI;

    // Rotation speed: small random value to rotate clockwise or counter-clockwise
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;
  }

  // Update position and rotation for each animation frame
  update() {
    this.x += this.dx;           // Move horizontally by dx
    this.y += this.dy;           // Move vertically by dy
    this.angle += this.rotationSpeed; // Update rotation angle

    // Wrap around the canvas edges horizontally
    if (this.x > width + this.size) this.x = -this.size;
    else if (this.x < -this.size) this.x = width + this.size;

    // Wrap around the canvas edges vertically
    if (this.y > height + this.size) this.y = -this.size;
    else if (this.y < -this.size) this.y = height + this.size;
  }

  // Draw the DNA image on canvas with current position and rotation
  draw(ctx) {
    ctx.save();                    // Save current canvas state
    ctx.translate(this.x, this.y); // Move origin to current position
    ctx.rotate(this.angle);        // Rotate canvas by current angle
    // Draw the image centered on the origin
    ctx.drawImage(
      dnaImage,
      -this.size / 2,
      -this.size / 2,
      this.size,
      this.size
    );
    ctx.restore();                 // Restore canvas state to undo transform
  }
}

// Array to hold multiple floating DNA objects
const floatingDNAs = [];
const NUM_DNA = 20;  // Number of floating DNA images to animate

// Initialize floatingDNA array with new FloatingDNA instances
function init() {
  for (let i = 0; i < NUM_DNA; i++) {
    floatingDNAs.push(new FloatingDNA());
  }
}

// Main animation loop: clear canvas, update and draw each floating DNA, then request next frame
function animate() {
  ctx.clearRect(0, 0, width, height);  // Clear entire canvas

  for (let dna of floatingDNAs) {
    dna.update();  // Update position and rotation
    dna.draw(ctx); // Draw image
  }

  requestAnimationFrame(animate);  // Continue animation at next repaint
}

// Start animation only after the DNA image has loaded
dnaImage.onload = () => {
  init();     // Create floating DNA objects
  animate();  // Start animation loop
};

// Function to automatically fill the search input and submit form (used for example links)
function autoSearch(queryText) {
  const input = document.querySelector('input[name="query"]');  // Find search input element
  input.value = queryText;  // Set input value to given query text
  input.form.submit();      // Submit the form automatically
}