document.addEventListener('DOMContentLoaded', function() {
    // Initialize zoom effect on product images
    const productImages = document.querySelectorAll('.wrap-pic-w img');
    
    productImages.forEach(img => {
        img.addEventListener('mousemove', function(e) {
            const zoomer = e.currentTarget.parentElement;
            const offsetX = e.offsetX ? e.offsetX : e.touches[0].pageX;
            const offsetY = e.offsetY ? e.offsetY : e.touches[0].pageY;
            const x = (offsetX / zoomer.offsetWidth) * 100;
            const y = (offsetY / zoomer.offsetHeight) * 100;
            
            // Add zoom effect class
            zoomer.classList.add('zoom-effect');
            
            // Set the background position based on mouse position
            img.style.transformOrigin = `${x}% ${y}%`;
        });

        img.addEventListener('mouseenter', function(e) {
            e.currentTarget.style.transform = 'scale(2)';
        });

        img.addEventListener('mouseleave', function(e) {
            e.currentTarget.style.transform = 'scale(1)';
        });
    });
});
