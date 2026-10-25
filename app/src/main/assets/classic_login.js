(function() {
    let gl = document.querySelector('section>div>div>div>div>a:first-child:not(.fuckd)') ||
             document.querySelector('a[data-testid="login-username-password"]:not(.fuckd)');
    if (gl) {
        let cl = document.createElement('a');
        cl.className = 'fuckd';
        cl.innerText = 'Email + Password Classic Login';
        cl.style.cssText = 'display:block;padding:10px;margin:10px 0;color:white;font-weight:bold;text-decoration:none;border:1px solid #ddd;background:#339;border-radius:30px';
        cl.href = window.location.href.includes('?') ? window.location.href + '&allow_password=1' : window.location.href + '?allow_password=1';
        gl.parentNode.insertBefore(cl, gl);
    }
})();