// ========================================
// MINIMAL EMERGENCY FIX - Just bypass ksense, no fancy login styling
// ========================================

KnackInitAsync = function ($, callback) {
    window.$ = $;
    window.LazyLoad = LazyLoad;
    console.log('[VESPA] Knack initialization (ksense bypassed)');
    
    // Small delay for Knack to set up
    setTimeout(function() {
        callback();
    }, 150);
};

// Advanced Search button text
$(document).on('knack-view-render.any', function (event, view, record) {
    $('.kn-add-filter').text('Advanced Search');
});

// Flashy button for view_1349
$(document).on('knack-view-render.view_1349', function(event, view, data) {
    var $btn = $('#view_1349 .kn-submit button.kn-button.is-primary');
    $btn.addClass('flashy-vespa-btn');
});

// Trusted Types Policy
(function() {
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            trustedTypes.createPolicy('default', {
                createHTML: (string) => string,
                createScriptURL: (string) => string,
                createScript: (string) => string,
            });
        } catch (e) {
            if (!e.message.includes('Policy already exists')) {
                console.error('[VESPA] Trusted-Types policy error:', e);
            }
        }
    }
}());

// Custom Print Button
$(document).on('knack-view-render.view_3054', function(event, view) {
    $('#' + view.key + ' #customStudentPrintBtn').on('click', function() {
        window.print();
    });
});

// Login Auto-fill
$(document).on('knack-scene-render.any', function(event, scene) {
    if (!scene || !scene.key) return;
    
    const isLoginScene = scene.key.includes('login') || 
                        scene.key.includes('sign') || 
                        scene.key.includes('landing') ||
                        scene.key === 'scene_1' || 
                        scene.key === 'scene_2' ||
                        scene.key === 'scene_1210';
    
    if (!isLoginScene) return;
    
    let emailToFill = null;
    let passwordToFill = null;
    let autoSubmit = false;
    
    if (window.location.hash && window.location.hash.includes('?')) {
        const hashParts = window.location.hash.split('?');
        if (hashParts.length > 1) {
            const hashParams = new URLSearchParams(hashParts[1]);
            emailToFill = hashParams.get('email');
            passwordToFill = hashParams.get('pwd');
            autoSubmit = hashParams.get('auto') === '1';
        }
    }
    
    if (emailToFill || passwordToFill) {
        setTimeout(function() {
            if (emailToFill) {
                const emailField = $('input[type="email"]').first();
                if (emailField.length) {
                    emailField.val(emailToFill).trigger('change');
                }
            }
            
            if (passwordToFill) {
                const passwordField = $('input[type="password"]').first();
                if (passwordField.length) {
                    passwordField.val(passwordToFill).trigger('change');
                }
            }
            
            if (autoSubmit && emailToFill && passwordToFill) {
                setTimeout(function() {
                    const loginButton = $('button[type="submit"]').first();
                    if (loginButton.length) {
                        loginButton.click();
                    }
                }, 1000);
            }
        }, 1000);
    }
});

// Clean up URL
$(document).on('knack-scene-render.any', function() {
    if (window.location.hash && window.location.hash.includes('pwd=')) {
        setTimeout(function() {
            const cleanHash = window.location.hash.split('?')[0];
            history.replaceState(null, '', window.location.pathname + cleanHash);
        }, 3000);
    }
});

// View hiding
(function() {
    const style = document.createElement('style');
    style.id = 'vespa-immediate-hide';
    style.textContent = `
        #view_3164, #view_3165, #view_3166, #view_3167,
        #view_3164 *, #view_3165 *, #view_3166 *, #view_3167 * {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            position: absolute !important;
            left: -99999px !important;
        }
    `;
    const firstHeadElement = document.head.firstChild;
    if (firstHeadElement) {
        document.head.insertBefore(style, firstHeadElement);
    } else {
        document.head.appendChild(style);
    }
})();

/// == Knack Builder Multi-App Loader v3.16 ==
// == Knack Builder Multi-App Loader v3.16 ==
// Goal: Load different JS apps based on Knack Scene/View event data, regardless of order.
// Strategy: Store the latest scene AND view keys. After each event, check if the
//           current combination matches an app. Load script, set specific config, call initializer.
// Changes from v3.15: Added configGlobalVar/initializerFunctionName, explicit call after load.

(function () {
    // --- Configuration ---
    // NOTE: This repo contains multiple loader copies. Some Knack deployments still use this one.
    // Keep it aligned with the main loader behavior for cache busting and latest app bundles.
    const VERSION = "3.68"; // Cache bust (FL4SH Lite moved to dedicated page)
    const DEBUG_MODE = false; // Set to true for debugging

    // Always-on banner to confirm which loader is currently active in the browser console.
    try { console.info(`[Knack Builder Loader] ACTIVE loader.js = vespa-main/public/loader.js v${VERSION}`); } catch (_) {}

    // Cache-bust JSDelivr URLs (used heavily for Account Manager + Academic Profile bundles)
    const JSDELIVR_CACHE_BUST = VERSION;
    function withCacheBust(url) {
        if (!url || typeof url !== 'string') return url;
        if (!url.includes('cdn.jsdelivr.net/gh/')) return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}v=${encodeURIComponent(JSDELIVR_CACHE_BUST)}`;
    }

    if (DEBUG_MODE) console.log(`[Knack Builder Loader v${VERSION}] Script start.`);

    // Load Font Awesome globally for all apps (especially Vue apps)
    function loadFontAwesome() {
        // Check if Font Awesome is already loaded
        if (document.querySelector('link[href*="font-awesome"]') || 
            document.querySelector('link[href*="fontawesome"]')) {
            console.log('[Knack Builder Loader] Font Awesome already loaded');
            return;
        }
        
        console.log('[Knack Builder Loader] Loading Font Awesome CSS globally...');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        link.integrity = 'sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==';
        link.crossOrigin = 'anonymous';
        link.referrerPolicy = 'no-referrer';
        document.head.appendChild(link);
        console.log('[Knack Builder Loader] ✅ Font Awesome CSS loaded');
    }
    
    // Call Font Awesome loader immediately
    loadFontAwesome();

    // Preload commonly used scripts for better performance
    function preloadScripts() {
        const preloadLinks = [
            'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/GeneralHeader7z.js',
            'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/universalRedirect1w.js',
        ];
        
        preloadLinks.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'script';
            link.href = url;
            document.head.appendChild(link);
        });
    }
    
    // Call preload as soon as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preloadScripts);
    } else {
        preloadScripts();
    }

    // === GOOGLE TRANSLATE - Simple Welsh/English Toggle ===
    // LAZY LOADING: Only load when user clicks the button (not on page load)
    // This prevents ANY delay for English users (majority)
    window.initializeGoogleTranslate = function() {
        console.log('[Google Translate] Lazy initialization triggered by user...');
        
        // Check if already initialized
        if (window._googleTranslateInitialized) {
            console.log('[Google Translate] Already initialized');
            return Promise.resolve(true);
        }
        
        // Skip on login pages
        const loginScenes = ['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5'];
        const currentScene = (typeof Knack !== 'undefined' && Knack.scene) ? Knack.scene.key : null;
        
        if (loginScenes.includes(currentScene)) {
            console.log('[Google Translate] Cannot load on login page');
            return Promise.resolve(false);
        }
        
        return new Promise((resolve) => {
            console.log('[Google Translate] Starting setup...');
            
            // Ensure container exists in body (persistent across navigation)
            if (!document.getElementById('google_translate_element')) {
                console.log('[Google Translate] Creating persistent container in body');
                const container = document.createElement('div');
                container.id = 'google_translate_element';
                document.body.insertBefore(container, document.body.firstChild);
            }
            
            // Global initializer function for Google Translate
            window.googleTranslateElementInit = function() {
                console.log('[Google Translate] googleTranslateElementInit called!');
                console.log('[Google Translate] google.translate available?', typeof google !== 'undefined' && google.translate ? 'YES' : 'NO');
                
                let container = document.getElementById('google_translate_element');
                console.log('[Google Translate] Container found?', container ? 'YES' : 'NO');
                
                // Create container if it doesn't exist
                if (!container) {
                    console.log('[Google Translate] Container missing, creating it now');
                    container = document.createElement('div');
                    container.id = 'google_translate_element';
                    document.body.insertBefore(container, document.body.firstChild);
                }
                
                // Clear any existing content to prevent duplicates
                container.innerHTML = '';
                
                // Make container visible temporarily so Google can inject the widget
                container.style.display = 'block';
                console.log('[Google Translate] Container made visible');
                
                try {
                    // Use HORIZONTAL layout - most reliable for getting <select> dropdown
                    // According to Google docs, this creates a proper select element
                    new google.translate.TranslateElement({
                        pageLanguage: 'en',
                        includedLanguages: 'en,cy', // English and Welsh only
                        layout: google.translate.TranslateElement.InlineLayout.HORIZONTAL,
                        autoDisplay: false,
                        multilanguagePage: true
                    }, 'google_translate_element');
                    
                    console.log('[Google Translate] TranslateElement created with HORIZONTAL layout');
                    console.log('[Google Translate] Waiting for widget to inject <select> element...');
                } catch (error) {
                    console.error('[Google Translate] Error creating TranslateElement:', error);
                    resolve(false);
                    return;
                }
                
                // Wait for selector to be created, THEN hide and style
                let selectorCheckAttempts = 0;
                const selectorCheckInterval = setInterval(() => {
                    selectorCheckAttempts++;
                    const selector = document.querySelector('.goog-te-combo');
                    
                    if (selector) {
                        clearInterval(selectorCheckInterval);
                        console.log('[Google Translate] ✅ Selector found! Waiting for Google to attach event listeners...');
                        
                        // Wait an extra second for Google to fully attach its internal event listeners
                        setTimeout(() => {
                            // NOW it's safe to hide and style
                            styleTranslateWidget();
                            hideGoogleBanner();
                            restoreSavedLanguage();
                            
                            window._googleTranslateInitialized = true;
                            console.log('[Google Translate] ✅ Fully initialized and ready!');
                            console.log('[Google Translate] Selector element:', selector);
                            console.log('[Google Translate] Selector has event listeners attached');
                            resolve(true);
                        }, 1000); // Extra 1 second for Google's listeners to attach
                    } else if (selectorCheckAttempts >= 20) { // 5 seconds max
                        clearInterval(selectorCheckInterval);
                        console.error('[Google Translate] ❌ Selector NOT created after 5 seconds - widget injection failed');
                        console.error('[Google Translate] Container HTML:', document.getElementById('google_translate_element')?.innerHTML);
                        resolve(false);
                    }
                }, 250);
                
                // Keep banner hidden continuously
                const bannerInterval = setInterval(hideGoogleBanner, 500);
                setTimeout(() => clearInterval(bannerInterval), 5000);
                
                // Add MutationObserver to catch banner if Google adds it later
                if (!window._googleBannerObserver) {
                    window._googleBannerObserver = new MutationObserver(() => {
                        hideGoogleBanner();
                    });
                    window._googleBannerObserver.observe(document.body, { 
                        childList: true, 
                        subtree: false 
                    });
                    console.log('[Google Translate] MutationObserver set to watch for banner');
                }
            };
            
            // Hide Google's banner frame aggressively
            function hideGoogleBanner() {
                // Remove all possible banner elements
                const bannerSelectors = [
                    '.goog-te-banner-frame',
                    'body > .skiptranslate:first-child',
                    '.goog-te-banner-frame.skiptranslate'
                ];
                
                bannerSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        el.style.display = 'none';
                        el.style.visibility = 'hidden';
                        el.style.height = '0';
                        el.remove();
                    });
                });
                
                // Fix body positioning that Google adds
                document.body.style.top = '0px';
                document.body.style.position = 'relative';
                document.documentElement.style.top = '0px';
                
                // Remove the 'translated-*' class side effects
                document.body.classList.forEach(cls => {
                    if (cls.startsWith('translated-')) {
                        document.body.style.top = '0px';
                    }
                });
            }
            
            // Restore saved language preference
            function restoreSavedLanguage() {
                const savedLang = localStorage.getItem('vespaPreferredLanguage');
                if (savedLang && savedLang !== 'en') {
                    console.log('[Google Translate] Restoring language:', savedLang);
                    setTimeout(() => {
                        const selector = document.querySelector('.goog-te-combo');
                        if (selector) {
                            selector.value = savedLang;
                            const evt = document.createEvent('HTMLEvents');
                            evt.initEvent('change', false, true);
                            selector.dispatchEvent(evt);
                            console.log('[Google Translate] Language restored to:', savedLang);
                            
                            // Update button label to match
                            updateLanguageButton(savedLang);
                        }
                    }, 500);
                }
            }
            
            // Helper function to update button labels and pin visibility
            function updateLanguageButton(currentLang) {
                const isWelsh = currentLang === 'cy';
                
                // Update desktop button
                const desktopBtn = document.getElementById('languageToggleBtn');
                if (desktopBtn) {
                    const label = desktopBtn.querySelector('.language-label');
                    if (label) label.textContent = isWelsh ? 'English' : 'Cymraeg';
                    desktopBtn.title = isWelsh ? 'Switch to English' : 'Newid i Gymraeg (Switch to Welsh)';
                }
                
                // Update mobile button
                const mobileBtn = document.getElementById('mobileLanguageToggle');
                if (mobileBtn) {
                    const span = mobileBtn.querySelector('span');
                    if (span) span.textContent = isWelsh ? 'Switch to English' : 'Newid i Gymraeg';
                }
                
                // Update pin button visibility
                const pinBtn = document.getElementById('languagePinBtn');
                if (pinBtn) {
                    if (isWelsh) {
                        // Show pin in Welsh mode
                        pinBtn.style.display = 'inline-flex';
                        pinBtn.classList.add('show');
                        
                        // Check if it's currently pinned
                        const savedLang = localStorage.getItem('vespaPreferredLanguage');
                        const savedUser = localStorage.getItem('vespaLanguageUser');
                        const currentUser = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes().email : null;
                        
                        if (savedLang === 'cy' && savedUser === currentUser) {
                            pinBtn.classList.add('active');
                            pinBtn.title = 'Preference saved (will auto-load Welsh)';
                        } else {
                            pinBtn.classList.remove('active');
                            pinBtn.title = 'Click to remember Welsh preference';
                        }
                    } else {
                        // Hide pin in English mode
                        pinBtn.classList.remove('show', 'active');
                        setTimeout(() => {
                            if (!pinBtn.classList.contains('show')) {
                                pinBtn.style.display = 'none';
                            }
                        }, 300);
                    }
                }
            }
            
            // Export for use by GeneralHeader
            window.updateLanguageButton = updateLanguageButton;
            
            // Style the widget
            function styleTranslateWidget() {
                if (document.getElementById('google-translate-minimal-styles')) return;
                
                const styles = document.createElement('style');
                styles.id = 'google-translate-minimal-styles';
                styles.textContent = `
                    /* Hide the Google Translate container visually but keep it in DOM */
                    #google_translate_element {
                        position: absolute !important;
                        left: -9999px !important;
                        top: -9999px !important;
                        width: 1px !important;
                        height: 1px !important;
                        overflow: hidden !important;
                        opacity: 0 !important;
                        pointer-events: none !important;
                    }
                    
                    /* Hide Google branding */
                    .goog-logo-link, .goog-te-gadget span { display: none !important; }
                    .goog-te-gadget { font-size: 0 !important; color: transparent !important; }
                    
                    /* Hide the dropdown visually but keep it in DOM */
                    .goog-te-combo { 
                        position: absolute !important;
                        left: -9999px !important;
                        opacity: 0 !important;
                    }
                    
                    /* Force hide banner */
                    .goog-te-banner-frame { display: none !important; }
                    body { top: 0 !important; }
                    
                    /* Hide tooltips */
                    #goog-gt-tt, .goog-te-balloon-frame { display: none !important; }
                `;
                document.head.appendChild(styles);
                console.log('[Google Translate] Styles applied to hide widget');
            }
            
            // Load Google Translate script only when needed
            const existingScript = document.getElementById('google-translate-script');
            
            if (!existingScript) {
                console.log('[Google Translate] Loading script on demand...');
                const script = document.createElement('script');
                script.id = 'google-translate-script';
                script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
                script.async = true;
                script.onload = () => {
                    console.log('[Google Translate] Script loaded successfully!');
                };
                script.onerror = (err) => {
                    console.error('[Google Translate] Failed to load script:', err);
                    resolve(false);
                };
                document.head.appendChild(script);
            } else {
                console.log('[Google Translate] Script already exists, calling init directly');
                if (typeof window.googleTranslateElementInit === 'function') {
                    window.googleTranslateElementInit();
                }
            }
        });
    };
    
    // OPTIONAL: Auto-initialize if user has a saved Welsh preference
    // This provides a better experience for Welsh users while not impacting English users
    // Now with user-specific checking - only auto-load if preference belongs to current user
    function checkAndAutoInitialize() {
        const savedLang = localStorage.getItem('vespaPreferredLanguage');
        const savedUser = localStorage.getItem('vespaLanguageUser');
        
        if (savedLang === 'cy') {
            // Wait for Knack to be ready to get current user
            setTimeout(() => {
                const currentUser = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes().email : null;
                
                if (!currentUser) {
                    console.log('[Google Translate] User not logged in yet, will check again');
                    return;
                }
                
                // Check if preference belongs to current user
                if (savedUser === currentUser) {
                    console.log('[Google Translate] Auto-initializing for returning Welsh user:', currentUser);
                    setTimeout(() => window.initializeGoogleTranslate(), 1000);
                } else if (savedUser) {
                    console.log('[Google Translate] Different user logged in. Previous:', savedUser, 'Current:', currentUser);
                    console.log('[Google Translate] Clearing previous user preference');
                    localStorage.removeItem('vespaPreferredLanguage');
                    localStorage.removeItem('vespaLanguageUser');
                } else {
                    // No user tracking (legacy preference), still auto-load but don't track
                    console.log('[Google Translate] Legacy preference found, auto-loading Welsh');
                    setTimeout(() => window.initializeGoogleTranslate(), 1000);
                }
            }, 500); // Wait for Knack to initialize
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndAutoInitialize);
    } else {
        checkAndAutoInitialize();
    }


   
    // Consider re-enabling only for specific slow operations
    (function loadUniversalLoadingScreen() {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/universal-loading-screen1f.js';
        script.async = true; 
        script.onload = () => console.log('[Knack Builder Loader] Universal loading screen loaded from CDN');
        script.onerror = () => console.error('[Knack Builder Loader] Failed to load universal loading screen from CDN');
        document.head.appendChild(script);
    })();
 
    
    // Lightweight stub to prevent errors in existing code
    window.VespaLoadingScreen = {
        show: () => console.log('[Loading Screen Stub] Show called'),
        hide: () => console.log('[Loading Screen Stub] Hide called'),
        updateText: () => {},
        updateProgress: () => {},
        isActive: () => false,
        showForNavigation: () => console.log('[Loading Screen Stub] Navigation loading called'),
        showForPageLoad: () => console.log('[Loading Screen Stub] Page load called'),
        showForOperation: () => {},
        config: {}
    };
    window.showLoadingScreen = window.VespaLoadingScreen.show;
    window.hideLoadingScreen = window.VespaLoadingScreen.hide;
    
    // Load critical navigation fixes immediately from CDN
    (function loadCoachingNavigationFix() {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/coaching-navigation-fix1h.js';
        script.async = false; // Load synchronously to ensure it's ready before navigation
        script.onload = () => console.log('[Knack Builder Loader] Coaching navigation fix loaded from CDN');
        script.onerror = () => console.error('[Knack Builder Loader] Failed to load coaching navigation fix from CDN');
        document.head.appendChild(script);
    })();
    
    
    
    // --- App Configuration ---
    const APPS = {
        /* DISABLED - Google Translate removed
        'googleTranslateInit': {
            scenes: ['all'],
            views: ['any'],
            scriptUrl: null,
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'googleTranslateInit',
                debugMode: true
            }),
            configGlobalVar: 'GOOGLE_TRANSLATE_INIT_CONFIG',
            initializerFunctionName: null,
            customInitializer: function() {
                // Translation functionality disabled - can be re-enabled if needed
                return;
            }
        },
        */

        'loginPageCustomizer': {
            scenes: ['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5'], // All login-related scenes
            views: ['any'], // Will load on any view
            scriptUrl: null, // No external script needed
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'loginPageCustomizer',
                debugMode: false,
                sceneKey: sceneKey,
                viewKey: viewKey,
                inlineStyles: true
            }),
            configGlobalVar: 'LOGIN_CUSTOMIZER_CONFIG',
            initializerFunctionName: null, // Self-executing
            customInitializer: function() {
                // This function will be called directly to customize the login page
                const log = (msg) => {
                    if (DEBUG_MODE) console.log(`[Login Customizer] ${msg}`);
                };
                
                log('Initializing login page customization');
                
                // Check if we're actually on a login page
                const hasLoginForm = document.querySelector('input[type="email"], input[name="email"], .kn-login');
                const isHomePage = window.location.hash === '#home/' || window.location.hash === '#home' || 
                                 window.location.pathname.endsWith('/vespa-academy/') ||
                                 window.location.pathname.endsWith('/vespa-academy');
                
                if (!hasLoginForm && !isHomePage) {
                    log('Not on login page, skipping customization');
                    return;
                }
                
                // Remove any existing custom styles to prevent duplicates
                const existingStyles = document.getElementById('login-page-custom-styles');
                if (existingStyles) {
                    existingStyles.remove();
                }
                
                // Create and inject custom styles
                const customStyles = `
                    /* Override default blue background */
                    body.knack-body.login,
                    body.knack-body:has(.kn-login),
                    body.knack-body:has(#kn-scene_1) {
                        background: linear-gradient(135deg, #0a1a3e 0%, #2a5298 50%, #1e3c72 100%) !important;
                        background-attachment: fixed !important;
                        min-height: 100vh;
                        overflow-x: hidden;
                    }
                    
                    /* Enhanced login container styling */
                    .kn-login,
                    #kn-scene_1 .kn-view {
                        background: rgba(255, 255, 255, 0.95) !important;
                        border-radius: 20px !important;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
                        padding: 40px !important;
                        max-width: 450px !important;
                        margin: 50px auto !important;
                        backdrop-filter: blur(10px) !important;
                        border: 1px solid rgba(255, 255, 255, 0.2) !important;
                        animation: fadeInUp 0.5s ease-out !important;
                    }
                    
                    @keyframes fadeInUp {
                        from {
                            opacity: 0;
                            transform: translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    
                    /* Style the logo area */
                    .kn-login h1,
                    #kn-scene_1 h1 {
                        color: #0a2b8c !important;
                        font-size: 32px !important;
                        font-weight: 700 !important;
                        text-align: center !important;
                        margin-bottom: 30px !important;
                        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1) !important;
                    }
                    
                    /* Input field styling - Simple like original */
                    .kn-login input[type="email"],
                    .kn-login input[type="password"],
                    .kn-login input[type="text"],
                    #kn-scene_1 input[type="email"],
                    #kn-scene_1 input[type="password"],
                    #kn-scene_1 input[type="text"] {
                        background: #f8f9fa !important;
                        border: 2px solid #e0e0e0 !important;
                        border-radius: 10px !important;
                        padding: 15px !important;
                        font-size: 16px !important;
                        transition: all 0.3s ease !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin-bottom: 15px !important;
                        text-align: left !important;
                        box-sizing: border-box !important;
                        display: block !important;
                    }

                    /* FIX: Some login pages render the form inside Bulma/Knack columns,
                       which can squash inputs into a narrow left column.
                       Force single-column layout on login scenes. */
                    .kn-login form,
                    .kn-login .kn-login-form,
                    .kn-login .kn-form {
                        width: 100% !important;
                        max-width: 100% !important;
                    }

                    .kn-login .columns {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 !important;
                    }

                    .kn-login .column {
                        width: 100% !important;
                        max-width: 100% !important;
                        flex: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    .kn-login .field,
                    .kn-login .control,
                    .kn-login .input,
                    .kn-login .kn-input,
                    .kn-login .kn-text,
                    .kn-login .kn-form-col,
                    .kn-login .kn-form-col-content {
                        width: 100% !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    
                    /* Hide Knack header on login pages */
                    #kn-scene_1 #knack-header,
                    #kn-scene_2 #knack-header {
                        display: none !important;
                    }
                    
                    .kn-login input:focus,
                    .kn-login-form input:focus,
                    #kn-scene_1 input:focus {
                        border-color: #00e5db !important;
                        box-shadow: 0 0 0 3px rgba(0, 229, 219, 0.2) !important;
                        outline: none !important;
                        background: white !important;
                    }
                    
                    /* Submit button styling */
                    .kn-login button[type="submit"],
                    .kn-login input[type="submit"],
                    #kn-scene_1 button[type="submit"],
                    #kn-scene_1 input[type="submit"],
                    .kn-button.is-primary {
                        background: linear-gradient(135deg, #00e5db 0%, #00b8d4 100%) !important;
                        border: none !important;
                        border-radius: 10px !important;
                        padding: 18px 30px !important;
                        font-size: 18px !important;
                        font-weight: 600 !important;
                        color: white !important;
                        cursor: pointer !important;
                        transition: all 0.3s ease !important;
                        width: 100% !important;
                        margin-top: 20px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 1px !important;
                        box-shadow: 0 4px 15px rgba(0, 229, 219, 0.3) !important;
                        line-height: 1.2 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        min-height: 54px !important;
                    }
                    
                    .kn-login button[type="submit"]:hover,
                    #kn-scene_1 button[type="submit"]:hover,
                    .kn-button.is-primary:hover {
                        transform: translateY(-2px) !important;
                        box-shadow: 0 6px 20px rgba(0, 229, 219, 0.4) !important;
                        background: linear-gradient(135deg, #00b8d4 0%, #00e5db 100%) !important;
                    }
                    
                    /* Links styling */
                    .kn-login a,
                    #kn-scene_1 a {
                        color: #0a2b8c !important;
                        text-decoration: none !important;
                        font-weight: 500 !important;
                        transition: color 0.3s ease !important;
                    }
                    
                    .kn-login a:hover,
                    #kn-scene_1 a:hover {
                        color: #00e5db !important;
                        text-decoration: underline !important;
                    }
                    
                    /* Add VESPA branding */
                    .kn-login:before,
                    #kn-scene_1 .kn-view:before {
                        content: "";
                        display: block;
                        width: 200px;
                        height: 80px;
                        margin: 0 auto 30px;
                        background: url('https://vespa.academy/_astro/vespalogo.BGrK1ARl.png') no-repeat center;
                        background-size: contain;
                    }
                    
                    /* Error message styling */
                    .kn-message.is-error {
                        background: #fee !important;
                        border: 1px solid #fcc !important;
                        border-radius: 8px !important;
                        padding: 12px !important;
                        color: #c00 !important;
                        margin-bottom: 20px !important;
                    }
                    
                    /* Success message styling */
                    .kn-message.is-success {
                        background: #efe !important;
                        border: 1px solid #cfc !important;
                        border-radius: 8px !important;
                        padding: 12px !important;
                        color: #060 !important;
                        margin-bottom: 20px !important;
                    }
                    
                    /* Loading spinner enhancement */
                    .kn-spinner {
                        border-color: #00e5db !important;
                        border-top-color: transparent !important;
                    }
                    
                    /* Form labels */
                    .kn-login label,
                    #kn-scene_1 label {
                        color: #333 !important;
                        font-weight: 600 !important;
                        font-size: 14px !important;
                        text-transform: uppercase !important;
                        letter-spacing: 0.5px !important;
                        margin-bottom: 8px !important;
                        display: block !important;
                    }
                    
                    /* Remember me checkbox */
                    .kn-login input[type="checkbox"],
                    #kn-scene_1 input[type="checkbox"] {
                        margin-right: 8px !important;
                        transform: scale(1.2) !important;
                        accent-color: #00e5db !important;
                    }
                    
                    /* Add subtle animation to the form */
                    .kn-login form,
                    #kn-scene_1 form {
                        animation: slideIn 0.6s ease-out 0.2s both !important;
                    }
                    
                    @keyframes slideIn {
                        from {
                            opacity: 0;
                            transform: translateX(-20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateX(0);
                        }
                    }
                    
                    /* Responsive adjustments */
                    @media (max-width: 768px) {
                        .kn-login,
                        #kn-scene_1 .kn-view {
                            margin: 20px !important;
                            padding: 30px 20px !important;
                        }
                        
                        .kn-login:before,
                        #kn-scene_1 .kn-view:before {
                            width: 150px;
                            height: 60px;
                        }
                    }
                    
                    /* Hide any default Knack branding if present */
                    .kn-logo {
                        display: none !important;
                    }
                    
                    /* Add a subtle pattern overlay */
                    body.knack-body.login:after,
                    body.knack-body:has(.kn-login):after {
                        content: "";
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background-image: 
                            radial-gradient(circle at 20% 50%, rgba(0, 229, 219, 0.1) 0%, transparent 50%),
                            radial-gradient(circle at 80% 80%, rgba(0, 43, 140, 0.1) 0%, transparent 50%);
                        pointer-events: none;
                        z-index: 1;
                    }
                    
                    /* Ensure login form is above the pattern */
                    .kn-login,
                    #kn-scene_1 {
                        position: relative;
                        z-index: 2;
                    }
                `;
                
                // Create style element
                const styleEl = document.createElement('style');
                styleEl.id = 'login-page-custom-styles';
                styleEl.textContent = customStyles;
                document.head.appendChild(styleEl);
                
                log('Login page customization applied');
                
                // Optional: Add welcome message or other dynamic content
                setTimeout(() => {
                    const loginForm = document.querySelector('.kn-login form');
                    if (loginForm && !document.querySelector('.custom-welcome-message')) {
                        const welcomeDiv = document.createElement('div');
                        welcomeDiv.className = 'custom-welcome-message';
                        welcomeDiv.style.cssText = 'text-align: center; margin-bottom: 20px; color: #666; font-size: 16px;';
                        welcomeDiv.innerHTML = '<p style="margin: 0;">Welcome to VESPA Academy</p>';
                        loginForm.insertBefore(welcomeDiv, loginForm.firstChild);
                    }
                }, 100);
            }
        },
        'generalHeader': {
            scenes: ['all'], // Special flag to load on all scenes
            views: ['any'],  // Special flag to load on any view
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/GeneralHeader7z.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'generalHeader',
                debugMode: false, // Enable during development
                sceneKey: sceneKey,
                viewKey: viewKey,
                // User detection
                userRoles: (typeof Knack !== 'undefined' && Knack.getUserRoles) ? Knack.getUserRoles() : [],
                userAttributes: (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : {},
                // Navigation elements to potentially hide/modify
                knackElements: {
                    menu: '.kn-menu',
                    tabs: '.kn-tab-menu'
                }
            }),
            configGlobalVar: 'GENERAL_HEADER_CONFIG',
            initializerFunctionName: 'initializeGeneralHeader'
        },
        'universalRedirect': {
            scenes: ['scene_1'],
            views: ['any'], // Will load on any view since we're not using a specific container
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/universalRedirect1w.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'universalRedirect',
                debugMode: false, // Enable for testing
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '.kn-scene-content' // Target the scene content directly
            }),
            configGlobalVar: 'UNIVERSAL_REDIRECT_CONFIG',
            initializerFunctionName: 'initializeUniversalRedirect'
        },
        'myAcademicProfile': {
  scenes: ['scene_43'], // Load on scene_43
  views: ['view_3046'],  // Specifically for view_3046
  scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/report/MyAcademicProfilePage2d.js', // Ensure this URL is correct and points to your script
  configBuilder: (baseConfig, sceneKey, viewKey) => ({
    ...baseConfig, // Includes knackAppId, knackApiKey, debugMode, etc.
    appType: 'myAcademicProfile',
    sceneKey: sceneKey, // Will be 'scene_43' in this case
    viewKey: viewKey,   // Will be 'view_3046' in this case
    elementSelector: '#view_3046', // Target for rendering the profile
  }),
  configGlobalVar: 'MY_ACADEMIC_PROFILE_CONFIG', // Matches the global variable used in your script
  initializerFunctionName: 'initializeMyAcademicProfilePage' // Matches the function name in your script
},
        'studentCoachLauncher': { // New entry for the Student Coach Launcher
            scenes: ['scene_43'], // Targets scene_43
            views: ['view_3055'],   // Specifically for view_3055
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/report/vespa-student-coach4p.js', // UPDATED URL
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'studentCoachLauncher',
                debugMode: false, // Enable debugging for studentCoachLauncher
                sceneKey: sceneKey,
                viewKey: viewKey, // Will be 'view_3055'
                elementSelector: '#view_3055 .kn-rich_text__content', // Target for the button/launcher
                aiCoachPanelId: 'studentCoachSlidePanel', // Unique ID for the student panel
                aiCoachToggleButtonId: 'activateStudentCoachBtn', // Unique ID for the student toggle button
                mainContentSelector: '#kn-scene_43' // Selector for the main content area to resize on this scene
            }),
            configGlobalVar: 'STUDENT_COACH_LAUNCHER_CONFIG',
            initializerFunctionName: 'initializeStudentCoachLauncher'
        },
'studentResultsViewer': {
    scenes: ['scene_1270'],
    views: ['view_3214'],
    scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/student-results-viewer@main/dist/studentResultsViewer1j.js',
    cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/student-results-viewer@main/dist/studentResultsViewer1g.css',
    configBuilder: (baseConfig, sceneKey, viewKey) => ({
        ...baseConfig,
        appType: 'studentResultsViewer',
        debugMode: true,
        sceneKey: sceneKey,
        viewKey: viewKey,
        elementSelector: '#view_3214 .kn-rich_text__content',
        renderMode: 'replace', // Replace rich text content
        // ... rest of config
    }),
    configGlobalVar: 'STUDENT_RESULTS_VIEWER_CONFIG',
    initializerFunctionName: null, // Set to null to treat as self-executing
    customInitializer: function() {
        // Custom initializer that tries multiple ways to initialize
        const config = window.STUDENT_RESULTS_VIEWER_CONFIG;
        if (!config) {
            console.error('[StudentResultsViewer] No config found');
            return;
        }
        
        console.log('[StudentResultsViewer] Attempting custom initialization...');
        
        // Try different initialization methods
        if (typeof window.initializeStudentResultsViewer === 'function') {
            console.log('[StudentResultsViewer] Found initializeStudentResultsViewer, calling it...');
            window.initializeStudentResultsViewer();
        } else if (window.StudentResultsViewer && typeof window.StudentResultsViewer.init === 'function') {
            console.log('[StudentResultsViewer] Found StudentResultsViewer.init, calling it...');
            window.StudentResultsViewer.init();
        } else {
            console.log('[StudentResultsViewer] No initialization function found, attempting direct render...');
            // Try to trigger a render directly if the app is self-initializing
            const container = document.querySelector(config.elementSelector);
            if (container) {
                // Dispatch a custom event that the app might be listening for
                container.dispatchEvent(new CustomEvent('studentResultsViewerReady', { detail: config }));
                
                // Also try triggering a Knack view render event in case the app listens for that
                $(document).trigger('knack-view-render.view_3214', { key: 'view_3214' });
            }
        }
    }
},

        'reportProfiles': {
            scenes: ['scene_1095', 'scene_1014'],
            views: ['view_2776', 'view_3015', 'view_2772', 'view_3204'], // Added view_3204 for scene_1014
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/report/ReportProfiles3h.js', // Updated to use a fixed version
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'reportProfiles',
                debugMode: true, // Enable debugging to see what's happening
                sceneKey: sceneKey,
                viewKey: viewKey,
                // Pass the correct selectors based on scene
                reportContainerSelector: sceneKey === 'scene_1014' ? 
                    '#view_2772, #view_2772 .report-content, #view_2772 .student-report' : 
                    '#view_2776 .kn-rich_text__content',
                profileContainerSelector: sceneKey === 'scene_1014' ? '#view_3204 .kn-rich_text__content' : '#view_3015 .kn-rich_text__content',
                elementSelectors: {
                    // For scene_1014, the report displays in view_2772 when a student is clicked (replacing the table)
                    // We need to look for the report content more broadly since it's not in a .kn-rich_text__content
                    reportContainer: sceneKey === 'scene_1014' ? 
                        '#view_2772, #view_2772 .report-content, #view_2772 .student-report, #view_2772 [data-report-content]' : 
                        '#view_2776 .kn-rich_text__content',
                    profileContainer: sceneKey === 'scene_1014' ? '#view_3204 .kn-rich_text__content' : '#view_3015 .kn-rich_text__content'
                }
            }),
            configGlobalVar: 'REPORTPROFILE_CONFIG',
            initializerFunctionName: 'initializeReportProfiles'
        },
        'aiCoachLauncher': { // New entry for the AI Coach Launcher
            scenes: ['scene_1095'], // Only scene_1095 - removed scene_1014 as it conflicts with Vue table
            views: ['view_3047'],   // Only view_3047
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/report/aiCoachLauncher4i.js', // Updated to point to the new dedicated script
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'aiCoachLauncher',
                debugMode: false, // Enable debugging for aiCoachLauncher
                sceneKey: sceneKey,
                viewKey: viewKey, // Will be 'view_3047' or 'view_2772'
                elementSelector: sceneKey === 'scene_1014' ? '#view_2772 .kn-rich_text__content' : '#view_3047 .kn-rich_text__content', // Target for the button
                aiCoachPanelId: 'aiCoachSlidePanel', // ID for the panel we'll create
                aiCoachToggleButtonId: 'activateAICoachBtn', // ID for the toggle button
                mainContentSelector: sceneKey === 'scene_1014' ? '#kn-scene_1014' : '#kn-scene_1095' // Selector for the main content area to resize
            }),
            configGlobalVar: 'AI_COACH_LAUNCHER_CONFIG',
            initializerFunctionName: 'initializeAICoachLauncher' // New function to create in ReportProfiles2k.js
        },
        'staffMobileReportFix': { // Mobile optimization for staff coaching reports
            scenes: ['scene_1095'], // Only scene_1095 - removed scene_1014 as it may conflict with Vue table
            views: ['any'], // Load on any view in these scenes
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/staffMobileReportFix2n.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'staffMobileReportFix',
                debugMode: false,
                sceneKey: sceneKey,
                viewKey: viewKey,
                targetScene: sceneKey,
                reportContainer: sceneKey === 'scene_1014' ? '#view_2772 #report-container, #view_3015 #report-container' : '#view_2776 #report-container, #view_3015 #report-container, #view_3205 #report-container',// Multiple possible views
                elementSelector: `#kn-${sceneKey}` // Target the entire scene
            }),
            configGlobalVar: 'STAFF_MOBILE_REPORT_FIX_CONFIG',
            initializerFunctionName: null // Self-executing
        },
        // Legacy Flashcards (old Knack version)
        'flashcards': {
            scenes: ['scene_1206'],
            views: ['view_3005'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/Flashcards4z.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'flashcards',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '.kn-rich-text',
                appUrl: 'https://vespa-flashcards-e7f31e9ff3c9.herokuapp.com/'
            }),
            configGlobalVar: 'VESPA_CONFIG',
            initializerFunctionName: 'initializeFlashcardApp'
        },
        // FL4SH Lite (new dedicated page: #fl4sh-lite)
        'fl4shLite': {
            scenes: ['scene_1300'],
            views: ['view_3293'],
            // FL4SH Lite (Vercel) running inside Knack window (uses Knack auth).
            // Bridge script dynamically loads the latest Vercel hashed assets.
            // Pinned to a commit SHA to avoid jsDelivr caching issues.
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FL4SH_Lite@6577bc6bc8ba906604c8745ad32a9ba59020794b/integrations/fl4sh-lite-knack-loader.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'fl4shLite',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '.kn-rich-text',
                appUrl: 'https://fl4sh-lite.vercel.app/'
            }),
            configGlobalVar: 'VESPA_CONFIG',
            initializerFunctionName: 'initializeFlashcardApp'
        },
        'studyPlanner': {
            scenes: ['scene_1208'],
            views: ['view_3008'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/studyPlanner2o.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'studyPlanner',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '.kn-rich-text',
                appUrl: 'https://studyplanner2-fc98f9e231f4.herokuapp.com/'
            }),
            configGlobalVar: 'STUDYPLANNER_CONFIG',
            initializerFunctionName: 'initializeStudyPlannerApp'
        },
        'taskboards': {
            scenes: ['scene_1188'], 
            views: ['view_3009'],   
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/taskboard1d.js', 
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'taskboards',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '.kn-rich-text',
                appUrl: 'https://vespataskboards-00affb61eb55.herokuapp.com/' 
            }),
            configGlobalVar: 'TASKBOARD_CONFIG', 
            initializerFunctionName: 'initializeTaskboardApp' 
        },
        'homepage': {
            scenes: ['scene_1210'],
            views: ['view_3013'],
            // NOTE: Pin to a commit SHA to avoid JSDelivr @main caching and enable quick rollback.
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@6e3d3ad/integrations/landingPage/Homepage5x.js', 
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'homepage',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#view_3013', 
                renderMode: 'scene-level', // NEW: Enable scene-level rendering
                hideOriginalView: true      // NEW: Hide the rich text view
            }),
            configGlobalVar: 'HOMEPAGE_CONFIG',
            initializerFunctionName: 'initializeHomepage'
        },
        'uploadSystem': {
            scenes: ['scene_1212'],
            views: ['view_3020'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/index10d.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'uploadSystem',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#view_3020 .kn-rich_text__content',
                apiUrl: 'https://vespa-upload-api-07e11c285370.herokuapp.com',
                userRole: Knack.getUserRoles()[0] || 'Staff Admin', 
            }),
            configGlobalVar: 'VESPA_UPLOAD_CONFIG',
            initializerFunctionName: 'initializeUploadBridge'
        },

        'staffHomepageCoaching': {
            scenes: ['scene_1215'],
            views: ['view_3024'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/landingPage/staffHomepage8e.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'staffHomepage',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#view_3024',
                renderMode: 'scene-level',     // NEW: Enable scene-level rendering
                hideOriginalView: true,         // NEW: Hide the rich text view
                sendGrid: {
                    proxyUrl: 'https://vespa-sendgrid-proxy-660b8a5a8d51.herokuapp.com/api/send-email',
                    fromEmail: 'noreply@notifications.vespa.academy',
                    fromName: 'VESPA Academy',
                    templateId: 'd-6a6ac61c9bab43e28706dbb3da4acdcf', 
                    confirmationtemplateId: 'd-2e21f98579f947b08f2520c567b43c35',
                }
            }),
            configGlobalVar: 'STAFFHOMEPAGE_CONFIG',
            initializerFunctionName: 'initializeStaffHomepage'
        },
        'dynamicStaffTable1014': { // Dynamic table enhancer for both staff admin and tutor pages
            scenes: ['scene_1014', 'scene_1095'], // Both staff admin and tutor scenes
            views: ['any'], // Load on any view in these scenes
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/vue-table-ui-enhancer-v1r.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'dynamicStaffTable1014',
                debugMode: true, // Enable debugging
                sceneKey: sceneKey,
                viewKey: viewKey,
                // Different view IDs for different scenes
                targetContainer: sceneKey === 'scene_1014' ? '#view_2772' : '#view_2776', 
                targetView: sceneKey === 'scene_1014' ? '#view_2772' : '#view_2776',
                hideOriginalView: false // Don't hide since we're enhancing it
            }),
            configGlobalVar: 'DYNAMIC_STAFF_TABLE_1014_CONFIG',
            initializerFunctionName: null // Self-executing
        },

        /* DISABLED - RESOURCE users now use scene_1252 with resourceDashboardDedicated
        'staffHomepageResource': {
            scenes: ['scene_1215'],
            views: ['view_3024'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/landingPage/ResourceDashboard1z.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'resourceDashboard',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#view_3024',
                renderMode: 'scene-level',     // NEW: Enable scene-level rendering
                hideOriginalView: true,         // NEW: Hide the rich text view
                sendGrid: {
                    proxyUrl: 'https://vespa-sendgrid-proxy-660b8a5a8d51.herokuapp.com/api/send-email',
                    fromEmail: 'noreply@notifications.vespa.academy',
                    fromName: 'VESPA Academy',
                    templateId: 'd-6a6ac61c9bab43e28706dbb3da4acdcf', 
                    confirmationtemplateId: 'd-2e21f98579f947b08f2520c567b43c35',
                }
            }),
            configGlobalVar: 'STAFFHOMEPAGE_CONFIG',
            initializerFunctionName: 'initializeResourceDashboard'
        },
        */
        'resourceDashboardDedicated': { // Dedicated Resource Dashboard for scene_1278
            scenes: ['scene_1278'], // Updated to new scene
            views: ['view_3237'], // Using the specific view you created
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/landingPage/ResourceDashboard3b.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'resourceDashboard',
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#view_3237', // Target the specific view
                renderMode: 'scene-level',
                hideOriginalView: true, // Hide the rich text view
                sendGrid: {
                    proxyUrl: 'https://vespa-sendgrid-proxy-660b8a5a8d51.herokuapp.com/api/send-email',
                    fromEmail: 'noreply@notifications.vespa.academy',
                    fromName: 'VESPA Academy',
                    templateId: 'd-6a6ac61c9bab43e28706dbb3da4acdcf', 
                    confirmationtemplateId: 'd-2e21f98579f947b08f2520c567b43c35',
                }
            }),
            configGlobalVar: 'STAFFHOMEPAGE_CONFIG',
            initializerFunctionName: 'initializeResourceDashboard'
        },
        'superUserLanding': { // NEW: Super User Landing Page for scene_1268
            scenes: ['scene_1268'],
            views: ['any'], // Will load on any view since we're using scene-level rendering
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/landingPage/superUserLandingPage1b.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'superUserLanding',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: false,
                elementSelector: `#kn-${sceneKey}`, // Target the entire scene
                // Super user specific settings
                showAdminTools: true,
                enableQuickAccess: true,
                adminApps: ['upload-manager', 'dashboard', 'vespa-customers', 'report-printing'],
                // UI customization
                headerTitle: 'Super User Dashboard',
                brandColor: '#2a3c7a',
                accentColor: '#079baa'
            }),
            configGlobalVar: 'SUPER_USER_LANDING_CONFIG',
            initializerFunctionName: 'initializeSuperUserLanding'
        },
        'coachSummary': { // New App: Coach Summary
            scenes: ['scene_1224'],
            views: ['view_3054'],
            // IMPORTANT: Replace with your actual GitHub URL for coachSummary.js when ready
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/report/coachSummary1d.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig, // Includes knackAppId, knackApiKey from sharedConfig
                appType: 'coachSummary',
                debugMode: false, // Enable debugging during development
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#view_3054', // Target the entire view_3049 for app content
                objectKeys: {
                    vespaResults: 'object_10' // From your README
                }
                // Field keys will be managed within coachSummary.js itself
            }),
            configGlobalVar: 'COACH_SUMMARY_CONFIG',
            initializerFunctionName: 'initializeCoachSummaryApp'
        },
                 'scene481Fix': { // Scene 481 Resources Page Fix
            scenes: ['scene_481'],
            views: ['any'], // Load on any view within scene_481
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/resourcesFix1q.js', // Local file for now
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'scene481Fix',
                debugMode: false,
                sceneKey: sceneKey,
                viewKey: viewKey
            }),
            configGlobalVar: 'SCENE_481_FIX_CONFIG',
            initializerFunctionName: null // This script self-initializes
        },
        'mobileReportFix': { // Student Report Mobile Optimization
            scenes: ['scene_43'],
            views: ['view_3041'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/mobileReportFix4h.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'mobileReportFix',
                debugMode: false,
                sceneKey: sceneKey,
                viewKey: viewKey
            }),
            configGlobalVar: 'MOBILE_REPORT_FIX_CONFIG',
            initializerFunctionName: null // Self-initializing script
        },
        // REMOVED vespaActivitiesFix - replaced with new V2 system
        'VESPAActivitiesStudentV2': { // NEW: Student Activities V2
            scenes: ['scene_1258'],
            views: ['any'], // Changed from view_3168 to load on any view in the scene
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/student/VESPAactivitiesStudent4t.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/student/VESPAactivitiesStudent4q.css',
            configBuilder: (baseConfig) => {
                return {
                    ...baseConfig,
                    appType: 'VESPAActivitiesStudentV2',
                    debugMode: false,
                    activityContentUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/shared/utils/activity_json_final1a.json',
                    problemMappingsUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/shared/vespa-problem-activity-mappings1a.json',
                    views: {
                        vespaResults: 'view_3164',
                        studentRecord: 'view_3165',
                        allActivities: 'view_3166',
                        activityProgress: 'view_3167',
                        richText: 'view_3168'
                    },
                    fields: {
                        // Student fields
                        prescribedActivities: 'field_1683',
                        finishedActivities: 'field_1380',
                        newUser: 'field_3655',
                        activityHistory: 'field_3656',
                        // VESPA scores
                        currentcycle: 'field_146',
                        visionScore: 'field_147',
                        effortScore: 'field_148',
                        systemsScore: 'field_149',
                        practiceScore: 'field_150',
                        attitudeScore: 'field_151',
                        visionc1: 'field_155',
                        effortc1: 'field_156',
                        systemsc1: 'field_157',
                        practicec1: 'field_158',
                        attitudec1: 'field_159',
                        visionc2: 'field_161',
                        effortc2: 'field_162',
                        systemsc2: 'field_163',
                        practicec2: 'field_164',
                        attitudec2: 'field_165',
                        visionc3: 'field_167',
                        effortc3: 'field_168',
                        systemsc3: 'field_169',
                        practicec3: 'field_170',
                        attitudec3: 'field_171',
                        // Activity Progress fields
                        progressId: 'field_3535',
                        student: 'field_3536',
                        activity: 'field_3537',
                        cycle: 'field_3538',
                        dateAssigned: 'field_3539',
                        dateStarted: 'field_3540',
                        dateCompleted: 'field_3541',
                        timeMinutes: 'field_3542',
                        status: 'field_3543',
                        verified: 'field_3544',
                        points: 'field_3545',
                        selectedVia: 'field_3546',
                        staffNotes: 'field_3547',
                        reflection: 'field_3548',
                        wordCount: 'field_3549'
                    },
                    objects: {
                        vespaResults: 'object_10',
                        student: 'object_6',
                        activities: 'object_44',
                        activityProgress: 'object_126',
                        achievements: 'object_127',
                        feedback: 'object_128'
                    }
                };
            },
            configGlobalVar: 'VESPA_ACTIVITIES_STUDENT_CONFIG',
            initializerFunctionName: 'initializeVESPAActivitiesStudent'
        },
        'VESPAActivitiesStaffV2': { // NEW: Staff Management V2
            scenes: ['scene_1256'],
            views: ['any'], // Changed from view_3179 to load on any view in the scene
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/staff/VESPAactivitiesStaff8b.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/staff/VESPAactivitiesStaff8b.css',
            configBuilder: (baseConfig) => ({
                ...baseConfig,
                appType: 'VESPAActivitiesStaffV2',
                debugMode: false,
                activityContentUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-activities-v2@main/shared/utils/activity_json_final1a.json',
                views: {
                    activityAssignments: 'view_3178',
                    studentResponses: 'view_3177',
                    richText: 'view_3179'
                },
                fields: {
                    // Staff role fields
                    staffAdminEmail: 'field_86',
                    tutorEmail: 'field_96',
                    headOfYearEmail: 'field_417',
                    subjectTeacherEmail: 'field_1879',
                    // Student connection fields
                    studentTutors: 'field_1682',
                    studentHeadsOfYear: 'field_547',
                    studentSubjectTeachers: 'field_2177',
                    studentStaffAdmins: 'field_190',
                    // Activity Progress fields (same as student)
                    progressId: 'field_3535',
                    student: 'field_3536',
                    activity: 'field_3537',
                    cycle: 'field_3538',
                    dateAssigned: 'field_3539',
                    dateStarted: 'field_3540',
                    dateCompleted: 'field_3541',
                    timeMinutes: 'field_3542',
                    status: 'field_3543',
                    verified: 'field_3544',
                    points: 'field_3545',
                    selectedVia: 'field_3546',
                    staffNotes: 'field_3547',
                    reflection: 'field_3548',
                    wordCount: 'field_3549'
                },
                objects: {
                    staffAdmin: 'object_5',
                    tutor: 'object_7',
                    headOfYear: 'object_18',
                    subjectTeacher: 'object_78',
                    student: 'object_6',
                    activities: 'object_44',
                    activityAnswers: 'object_46',
                    activityProgress: 'object_126',
                    achievements: 'object_127',
                    feedback: 'object_128'
                }
            }),
            configGlobalVar: 'VESPA_ACTIVITIES_STAFF_CONFIG',
            initializerFunctionName: 'initializeVESPAActivitiesStaff'
        },
        'bulkPrint': { // Bulk Print App
            scenes: ['scene_1227'],
            views: ['view_3062'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/report/report_printing4h.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => {
                // Debug log to check what's in baseConfig
                if (DEBUG_MODE) {
                    console.log('[BulkPrint ConfigBuilder] baseConfig:', baseConfig);
                    console.log('[BulkPrint ConfigBuilder] baseConfig keys:', Object.keys(baseConfig));
                }
                
                // Explicitly include the credentials
                const config = {
                    knackAppId: baseConfig.knackAppId || '5ee90912c38ae7001510c1a9',
                    knackApiKey: baseConfig.knackApiKey || '0b84db19-81e2-409c-a914-f840daf52eb9',
                    appType: 'bulkPrint',
                    debugMode: false, // production
                    sceneKey: sceneKey,
                    viewKey: viewKey,
                    elementSelector: '#view_3062', // Target the correct view
                    objectKeys: {
                        vespaResults: 'object_10' // From your README
                    }
                    // Field keys will be managed within report_printing.js itself
                };
                
                if (DEBUG_MODE) console.log('[BulkPrint ConfigBuilder] Final config:', config);
                return config;
            },
            configGlobalVar: 'BULK_PRINT_CONFIG',
            initializerFunctionName: 'initializeBulkPrintApp'
        },

        'questionnaireValidator': { // NEW: Questionnaire Validator
            scenes: ['all'], // Load on all scenes for students
            views: ['any'],  // Load on any view
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/questionnaireValidator1s.js', // Local file for now
            configBuilder: (baseConfig, sceneKey, viewKey) => {
                // For now, let's load for all users and check inside the script
                // This avoids timing issues with user detection
                return {
                    ...baseConfig,
                    appType: 'questionnaireValidator',
                    debugMode: false,
                    enabled: true,  // Set to false to disable the validator
                    sceneKey: sceneKey,
                    viewKey: viewKey
                };
            },
            configGlobalVar: 'QUESTIONNAIRE_VALIDATOR_CONFIG',
            initializerFunctionName: 'initializeQuestionnaireValidator'
        },

        'resourceStaffManager': { // Resource Portal Staff Admin Account Management
            scenes: ['scene_1272'],
            views: ['any'], // Load on any view in the scene
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/ResourceStaffManager1m.js',
            // Load Vue 3 BEFORE our script
            dependencies: [
                'https://unpkg.com/vue@3.3.4/dist/vue.global.prod.js'
            ],
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'resourceStaffManager',
                debugMode: false,
                sceneKey: sceneKey,
                viewKey: viewKey,
                elementSelector: '#kn-scene_1272',
                sendGrid: {
                    proxyUrl: 'https://vespa-sendgrid-proxy-660b8a5a8d51.herokuapp.com/api/send-email',
                    fromEmail: 'noreply@notifications.vespa.academy',
                    fromName: 'VESPA Academy',
                    resourceWelcomeTemplateId: 'd-29e82dfb3bd14de6815f4b225b9ef7b3' // Resource Portal welcome email template
                }
            }),
            configGlobalVar: 'RESOURCE_STAFF_MANAGER_CONFIG',
            initializerFunctionName: 'initializeResourceStaffManager'
        },
        'dashboard': { // DASHBOARD App Configuration
            scenes: ['scene_1225'],
            views: ['any'], // Changed to 'any' since we're using scene-level rendering
                        // Load Vue dashboard build files from new repository
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/DASHBOARD-Vue@main/dist/vuedash4v.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/DASHBOARD-Vue@main/dist/vuedash4v.css',
            // Load WordCloud2 BEFORE Vue dashboard - using same CDN as prototype
            dependencies: [
                'https://cdn.jsdelivr.net/npm/wordcloud@1.2.2/src/wordcloud2.js'
            ],
            configBuilder: (baseConfig, sceneKey, viewKey) => {
                const userAttributes = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : {};
                const loggedInUserEmail = userAttributes.email || null; // Get user's email

                return {
                    ...baseConfig,
                    appType: 'dashboard',
                    debugMode: false,
                    sceneKey: sceneKey,
                    viewKey: viewKey,
                    elementSelector: '#scene-level-container-dashboard', // Will be created by scene-level rendering
                    renderMode: 'scene-level', // Enable scene-level rendering
                    hideOriginalView: true, // Hide the rich text view
                    herokuAppUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com',
                    loggedInUserEmail: loggedInUserEmail, // Pass the logged-in user's email
                    objectKeys: {
                        vespaResults: 'object_10',
                        questionnaireResponses: 'object_29',
                        staffAdminRoles: 'object_5', // Object key for Staff Admin Roles
                        superUserRoles: 'object_21', // Object key for Super User Roles
                        nationalBenchmarkData: 'object_120' // Key for national data (also object_10)
                    },
                    themeColors: {
                        vision: '#ff8f00',
                        effort: '#86b4f0',
                        systems: '#72cb44',
                        practice: '#7f31a4',
                        attitude: '#f032e6'
                    }
                };
            },
            configGlobalVar: 'DASHBOARD_CONFIG',
            initializerFunctionName: 'initializeVueDashboard' // Changed to Vue initializer
        },
        'curriculumResources': { // SPA v2f - FIXED: Completion saving + Problem search with dynamic mapping
            scenes: ['scene_1280'], // Test scene (will change to scene_481 for production)
            views: ['view_3244'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/curriculum-spa2f.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/FlashcardLoader@main/integrations/curriculum-spa2f.css',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'curriculumResources',
                debugMode: false,
                sceneKey: sceneKey,
                viewKey: viewKey
            }),
            configGlobalVar: 'CURRICULUM_RESOURCES_CONFIG',
            initializerFunctionName: 'initializeCurriculumSPA'
        },
        'questionnaireV2': { // NEW: VESPA Questionnaire V2 with Supabase + Knack dual-write
            scenes: ['scene_1282'],
            views: ['view_3247'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-questionniare-v2@d1fc0385563edfa4898143d4da68cc6de7033d3c/dist/questionnaire1Q.js',
            cssUrl: null, // CSS embedded in JS
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'questionnaireV2',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true, // Enable for initial testing
                elementSelector: '#view_3247',
                renderMode: 'replace',
                hideOriginalView: true,
                apiUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com'
            }),
            configGlobalVar: 'QUESTIONNAIRE_V2_CONFIG',
            initializerFunctionName: 'initializeQuestionnaireV2'
        },
        'reportV2': { // NEW: VESPA Individual Report V2 - Now reads from Knack (source of truth)
            scenes: ['scene_1284'],
            views: ['view_3250'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-report-v2@643a04e/individual-report/dist/report1an.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-report-v2@643a04e/individual-report/dist/report1an.css',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'reportV2',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true, // Enable for testing
                elementSelector: '#view_3250',
                renderMode: 'replace',
                hideOriginalView: true,
                apiUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com'
            }),
            configGlobalVar: 'REPORT_V2_CONFIG',
            initializerFunctionName: 'initializeReportV2'
        },
        'staffOverviewV2': { // NEW: VESPA Staff Overview V2 - Table with all connected students
            scenes: ['scene_1286'],
            views: ['view_3258'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-report-v2@643a04e/staff-overview/dist/staff-overview1z.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-report-v2@643a04e/staff-overview/dist/staff-overview1z.css',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'staffOverviewV2',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true, // Enable for testing
                elementSelector: '#view_3258',
                renderMode: 'replace',
                hideOriginalView: true,
                apiUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com'
            }),
            configGlobalVar: 'STAFF_OVERVIEW_V2_CONFIG',
            initializerFunctionName: 'initializeStaffOverviewV2'
        },
        'academicProfileV2': { // NEW: Academic Profile V2 - Supabase + Knack dual-write
            scenes: ['scene_1284'],  // Individual Report scene (same as reportV2)
            views: ['any'],  // Load on any view in scene_1284 (timing fix)
            // Keep aligned with homepage Academic Profile mount (FlashcardLoader Homepage5x.js)
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-report-v2@e1af14e/academic-profile/dist/academic-profile1i.js',
            cssUrl: null,  // Styles embedded in JS
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'academicProfileV2',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true, // Enable for testing
                elementSelector: '#view_3259',  // Target the specific view above report
                renderMode: 'replace',
                hideOriginalView: true,  // Replace rich text content
                apiUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com',
                editable: true  // Allow staff editing
            }),
            configGlobalVar: 'ACADEMIC_PROFILE_V2_CONFIG',
            initializerFunctionName: 'initializeAcademicProfileV2'
        },
        'studentActivitiesV3': {
            scenes: ['scene_1288'],
            views: ['view_3262'],
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-questionniare-v2@main/vespa-activities-v3/student/dist/student-activities2f.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-questionniare-v2@main/vespa-activities-v3/student/dist/student-activities2f.css',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'studentActivitiesV3',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true,  // Set to false for production
                elementSelector: '#view_3262',
                renderMode: 'replace',
                hideOriginalView: true,
                apiUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com',
                // Supabase config will be embedded at build time
                problemMappingsUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-questionniare-v2@main/vespa-activities-v3/shared/vespa-problem-activity-mappings1a.json'
            }),
            configGlobalVar: 'STUDENT_ACTIVITIES_V3_CONFIG',
            initializerFunctionName: 'initializeStudentActivitiesV3'
        },
        'staffActivitiesMonitorV3': {
            scenes: ['scene_1290'],  // CONFIRMED: activity-monitor scene
            views: ['view_3268'],    // CONFIRMED: activity-monitor view
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-questionniare-v2@main/vespa-activities-v3/staff/dist/activity-dashboard-3j.js',
            cssUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/VESPA-questionniare-v2@main/vespa-activities-v3/staff/dist/activity-dashboard-3j.css',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'staffActivitiesMonitorV3',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true,  // Set to false for production
                elementSelector: '#view_3268',
                renderMode: 'replace',
                hideOriginalView: true,
                apiUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com'
            }),
            configGlobalVar: 'STAFF_ACTIVITIES_MONITOR_V3_CONFIG',
            initializerFunctionName: 'initializeStaffActivitiesMonitorV3'
        },
        'accountManagerV2': { // NEW: Enhanced Supabase-First Account Management + School Management (2m - bulk operations fixed)
            scenes: ['scene_1292'],  // Account management page (#vespa-account-management)
            views: ['view_3272'],    // Test view
            // Use latest Account Manager (2r) which includes Academic Profile tooling (Add Subject) and ALPS export snapshot upload flow
            scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@75733d8060d0c3b0e41565d1325098c73c7d91f3/src/accountManager2r.js',
            configBuilder: (baseConfig, sceneKey, viewKey) => ({
                ...baseConfig,
                appType: 'accountManagerV2',
                sceneKey: sceneKey,
                viewKey: viewKey,
                debugMode: true,  // Set to false for production
                elementSelector: '#view_3272 .kn-rich_text__content',
                renderMode: 'replace',
                hideOriginalView: false,
                apiUrl: 'https://vespa-upload-api-07e11c285370.herokuapp.com'
            }),
            configGlobalVar: 'ACCOUNT_MANAGER_CONFIG',
            initializerFunctionName: 'initializeAccountManager'
        }

    };

    // --- Shared Configuration --- (Optional: Can be merged by configBuilder if needed)
    const sharedConfig = {
        knackAppId: '5ee90912c38ae7001510c1a9',
        knackApiKey: '0b84db19-81e2-409c-a914-f840daf52eb9',
        sendGrid: {
            fromEmail: 'noreply@notifications.vespa.academy',
            fromName: 'VESPA Academy'
        }
    };

    // --- State ---
    let loadedAppKey = null;
    let lastRenderedSceneKey = null; // Store the latest scene key
    let lastRenderedViewKey = null;  // Store the latest view key

    // --- Helper Functions ---
    function log(message, data) {
        if (DEBUG_MODE) {
            let logData = data;
            // Avoid circular structure issues in logging complex objects
            if (typeof data === 'object' && data !== null) {
                try { logData = JSON.parse(JSON.stringify(data)); } catch (e) { logData = "[Data non-serializable for logging]"; }
            }
            console.log(`[Loader v${VERSION}] ${message}`, logData === undefined ? '' : logData);
        }
    }

    function errorLog(message, data) {
        console.error(`[Loader v${VERSION} ERROR] ${message}`, data === undefined ? '' : data);
        // Optionally, include more details or context if DEBUG_MODE is true
        if (DEBUG_MODE && typeof data === 'object' && data !== null && data.exception) {
            console.error("[Loader Detailed Exception]:", data.exception);
        }
    }
    
    // Translation support: Determine appropriate delay for translation refresh
    function getTranslationDelayForApp(appKey) {
        // Apps that need more time to render before translation
        const translationDelays = {
            // Complex reports and visualizations need more time
            'reportProfiles': 2000,
            'myAcademicProfile': 2000,
            'studentCoachLauncher': 1500,
            'mobileReportFix': 2000,
            'coachSummary': 1500,
            
            // Dashboard and data-heavy apps
            'dashboard': 2500, // Vue dashboard needs extra time
            'dynamicStaffTable1014': 2000, // Vue table enhancer
            'studentResultsViewer': 1500,
            
            // Homepage and landing pages
            'homepage': 1500,
            'staffHomepageCoaching': 1500,
            'staffHomepageResource': 1500,
            'resourceDashboardDedicated': 1500,
            'superUserLanding': 1500,
            
            // Activities system
            'VESPAActivitiesStudentV2': 1800,
            'VESPAActivitiesStaffV2': 1800,
            
            // Standard apps with moderate complexity
            'flashcards': 1000,
            'studyPlanner': 1000,
            'taskboards': 1000,
            'uploadSystem': 1000,
            'bulkPrint': 1200,
            
            // Simple apps or those that don't need translation
            'generalHeader': 0, // Already handles its own translation
            'loginPageCustomizer': 500, // Simple DOM changes
            'universalRedirect': 0, // No visible content
            'questionnaireValidator': 0, // Background process
            'scene481Fix': 800,
            'aiCoachLauncher': 1000,
            'staffMobileReportFix': 1000
        };
        
        // Return specific delay or default
        return translationDelays[appKey] || 1000;
    }

    // Adjusted loadScript: Resolves AFTER success, easier chaining
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const finalUrl = withCacheBust(url);
            // For CDN scripts (especially large ones like Vue dashboard), use direct script tag
            if (finalUrl.includes('cdn.jsdelivr.net') || finalUrl.includes('4sighteducation.github.io')) {
                log("loadScript: Loading CDN script via script tag:", finalUrl);
                
                // CRITICAL FIX: Remove any existing script with the same URL to prevent conflicts
                const existingScripts = document.querySelectorAll(`script[src="${finalUrl}"]`);
                if (existingScripts.length > 0) {
                    log(`loadScript: Found ${existingScripts.length} existing script(s) with same URL, removing...`);
                    existingScripts.forEach(oldScript => oldScript.remove());
                }
                
                const script = document.createElement('script');
                script.src = finalUrl;
                script.async = true;
                
                script.onload = () => {
                    log("loadScript: Script loaded successfully via script tag:", finalUrl);
                    // Add a check to see if we're loading Vue Dashboard
                    if (finalUrl.includes('vuedash')) {
                        log("loadScript: Vue Dashboard loaded - checking for initializer");
                        if (typeof window.initializeVueDashboard === 'function') {
                            log("loadScript: initializeVueDashboard function found!");
                        } else {
                            log("loadScript: initializeVueDashboard function NOT found");
                        }
                    }
                    resolve();
                };
                
                script.onerror = (error) => {
                    errorLog("loadScript: Failed to load script via script tag:", { scriptUrl: finalUrl, error: error });
                    reject(new Error(`Failed to load script: ${finalUrl}`));
                };
                
                document.head.appendChild(script);
            } else {
                // Use jQuery for other scripts
                if (typeof $ === 'undefined' || typeof $.getScript === 'undefined') {
                    const errorMsg = "jQuery ($) or $.getScript is not defined.";
                    errorLog(errorMsg, { scriptUrl: finalUrl });
                    return reject(new Error(errorMsg));
                }
                log("loadScript: Attempting to load script via jQuery:", finalUrl);
                $.getScript(finalUrl)
                    .done(() => {
                        log("loadScript: Script loaded successfully via getScript:", finalUrl);
                        // Add a check to see if we're loading ResourceDashboard
                        if (finalUrl.includes('ResourceDashboard')) {
                            log("loadScript: ResourceDashboard.js loaded - checking for initializer");
                            if (typeof window.initializeResourceDashboard === 'function') {
                                log("loadScript: initializeResourceDashboard function found!");
                            } else {
                                log("loadScript: initializeResourceDashboard function NOT found");
                            }
                        }
                        resolve(); // Resolve *after* script execution succeeded
                    })
                    .fail((jqxhr, settings, exception) => {
                        errorLog("loadScript: Failed to load script via jQuery.", { scriptUrl: finalUrl, status: jqxhr?.status, settings: settings, exception: exception });
                        reject(new Error(`Failed to load script: ${finalUrl} - ${exception || 'Unknown reason'}`));
                    });
            }
        });
    }

    // New helper function to load scripts sequentially
    async function loadScriptsSequentially(urls) {
        for (const url of urls) {
            log(`loadScriptsSequentially: Attempting to load ${url}`);
            try {
                await loadScript(url); // Assumes loadScript returns a Promise that resolves on success
                log(`loadScriptsSequentially: Successfully loaded ${url}`);
            } catch (error) {
                errorLog(`loadScriptsSequentially: Failed to load ${url}`, error);
                throw new Error(`Failed to load essential script: ${url}`); // Stop if a critical script fails
            }
        }
    }

    // New helper function to load CSS dynamically
    function loadCSS(url) {
        return new Promise((resolve, reject) => {
            log("loadCSS: Attempting to load stylesheet:", url);
            
            // CRITICAL FIX: Remove any existing link with the same URL to prevent conflicts
            const existingLinks = document.querySelectorAll(`link[href="${url}"]`);
            if (existingLinks.length > 0) {
                log(`loadCSS: Found ${existingLinks.length} existing stylesheet(s) with same URL, removing...`);
                existingLinks.forEach(oldLink => oldLink.remove());
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = url;
            link.onload = () => {
                log("loadCSS: Stylesheet loaded successfully:", url);
                resolve();
            };
            link.onerror = () => {
                errorLog("loadCSS: Failed to load stylesheet.", { stylesheetUrl: url });
                reject(new Error(`Failed to load stylesheet: ${url}`)); // Reject promise on error
            };
            document.getElementsByTagName('head')[0].appendChild(link);
        });
    }

    // Apply scene-level rendering adjustments
    function applySceneLevelRendering(config, sceneKey, appKey) {
        log(`applySceneLevelRendering: Applying for scene ${sceneKey}, app ${appKey}`);
        
        // Apply dark background for landing pages
        const landingPageScenes = ['scene_1210', 'scene_1215', 'scene_1278']; // Updated to new resource scene
        if (landingPageScenes.includes(sceneKey)) {
            log(`applySceneLevelRendering: Applying dark background for landing page scene ${sceneKey}`);
            
            // Apply background color directly via JavaScript
            document.body.style.backgroundColor = '#072769';
            document.body.style.backgroundImage = 'none';
            
            // Also add a class for CSS targeting
            document.body.classList.add('landing-page-scene');
            document.body.classList.add(`landing-page-${sceneKey}`);
            
            // Apply to all Knack containers as well
            const containers = document.querySelectorAll('.kn-scene, .kn-scene-content, .kn-content, #kn-app-container');
            containers.forEach(container => {
                container.style.backgroundColor = '#072769';
                container.style.backgroundImage = 'none';
            });
        }
        
        // Apply professional background for dashboard scene
        if (sceneKey === 'scene_1225') {
            log(`applySceneLevelRendering: Applying dashboard background for scene ${sceneKey}`);
            
            // Apply matching grey background for the dashboard
            document.body.style.backgroundColor = '#d5deeb';
            document.body.style.backgroundImage = 'none';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.minHeight = '100vh';
            
            // Add a class for CSS targeting
            document.body.classList.add('dashboard-scene');
            
            // Apply to all Knack containers as well
            const containers = document.querySelectorAll('.kn-scene, .kn-scene-content, .kn-content, #kn-app-container');
            containers.forEach(container => {
                container.style.backgroundColor = 'transparent';
                container.style.backgroundImage = 'none';
            });
        }
        
        // Hide the original rich text view if configured
        if (config.hideOriginalView && config.elementSelector) {
            const originalView = document.querySelector(config.elementSelector);
            if (originalView) {
                originalView.style.display = 'none';
                log(`applySceneLevelRendering: Hid original view ${config.elementSelector}`);
            }
        }
        
        // Create a scene-level container
        // Try different selectors for the scene element
        let sceneElement = document.getElementById('kn-' + sceneKey) || 
                          document.getElementById(sceneKey) ||
                          document.querySelector(`[data-scene-key="${sceneKey}"]`) ||
                          document.querySelector('.kn-scene'); // Fallback to any scene element
                          
        if (!sceneElement) {
            errorLog(`applySceneLevelRendering: Scene element ${sceneKey} not found`);
            return;
        }
        
        // Use app-specific container ID to prevent conflicts
        const containerId = `scene-level-container-${appKey || 'default'}`;
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.className = 'scene-level-dashboard-container';
            
            // Insert at the beginning of scene content
            const sceneContent = sceneElement.querySelector('.kn-scene-content') || sceneElement;
            sceneContent.insertBefore(container, sceneContent.firstChild);
            log(`applySceneLevelRendering: Created scene-level container with ID: ${containerId}`);
        } else {
            // Clear existing content if container already exists
            container.innerHTML = '';
            log(`applySceneLevelRendering: Cleared existing scene-level container content for: ${containerId}`);
        }
        
        // Add a temporary loading message
        container.innerHTML = '<div id="scene-loading-message" style="padding: 20px; text-align: center; color: #999;">Loading...</div>';
        
        // Update the config to use the new container
        config.elementSelector = '#' + containerId;
        if (window[config.configGlobalVar || 'HOMEPAGE_CONFIG']) {
            window[config.configGlobalVar || 'HOMEPAGE_CONFIG'].elementSelector = '#' + containerId;
        }
        
        log(`applySceneLevelRendering: Updated elementSelector to #${containerId}`);
        
        // Inject scene-level styles
        if (!document.getElementById('scene-level-styles-' + sceneKey)) {
            const styles = `
                /* Scene-level styles for ${sceneKey} */
                .scene-level-dashboard-container {
                    width: 100%;
                    max-width: 100% !important;
                    margin: 0;
                    padding: 0 20px;
                    position: relative;
                    display: block !important; /* Ensure it's visible */
                    visibility: visible !important;
                    opacity: 1 !important;
                    box-sizing: border-box;
                }
                
                /* Remove Knack's default padding from parent containers */
                .kn-scene .kn-scene-content {
                    max-width: none !important;
                    padding: 0 !important;
                }
                
                .kn-content {
                    max-width: none !important;
                    padding: 0 !important;
                }
                
                /* Background color handled dynamically - see applySceneLevelRendering */
                
                /* Additional CSS for landing page scenes */
                body.landing-page-scene,
                body.landing-page-scene .kn-scene,
                body.landing-page-scene .kn-scene-content,
                body.landing-page-scene .kn-content,
                body.landing-page-scene #kn-app-container {
                    background-color: #072769 !important;
                    background-image: none !important;
                }
                
                /* Additional CSS for dashboard scene */
                body.dashboard-scene #kn-app-container,
                body.dashboard-scene .kn-scene,
                body.dashboard-scene .kn-scene-content,
                body.dashboard-scene .kn-content {
                    background-color: transparent !important;
                }
                
                /* Dashboard specific container styling */
                body.dashboard-scene #scene-level-container-dashboard {
                    background: transparent;
                    border-radius: 0;
                    box-shadow: none;
                    margin: 0 auto;
                    max-width: 100%;
                    padding: 0 20px;
                    overflow-x: hidden;
                    box-sizing: border-box;
                }
                
                /* Remove any white backgrounds from parent containers */
                #kn-app-container,
                #kn-scene_1210,
                #kn-scene_1225 {
                    background-color: transparent !important;
                }
                
                /* Ensure the homepage content is visible */
                #vespa-homepage {
                    display: block !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                }
                
                /* Ensure modals work properly */
                .vespa-modal {
                    position: fixed !important;
                    z-index: 999999 !important;
                }
                
                /* Hide the original rich text views */
                #view_3013,
                #view_3058,
                #view_2772 {
                    display: none !important;
                }
                
                @media (max-width: 768px) {
                    .scene-level-dashboard-container {
                        margin: 0;
                        padding: 0 10px;
                    }
                    
                    body.dashboard-scene #scene-level-container-dashboard {
                        margin: 0;
                        padding: 0 10px;
                        border-radius: 0;
                    }
                }
            `;
            
            const styleEl = document.createElement('style');
            styleEl.id = 'scene-level-styles-' + sceneKey;
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);
            log(`applySceneLevelRendering: Injected scene-level styles`);
        }
    }

    // Simplified findAppToLoad: DOM check for reportProfiles, standard loop for others.
    function findAppToLoad(sceneKey, viewKey) {
        let appsFound = []; // Store multiple apps if applicable

        // DOM check for myAcademicProfile
        if (APPS.myAcademicProfile && sceneKey === APPS.myAcademicProfile.scenes[0]) { // Checks if current scene is scene_43
            const appConfig = APPS.myAcademicProfile;
            const viewElement = document.querySelector(`#${appConfig.views[0]}`); // Check for #view_3046 container
            if (viewElement) {
                log(`findAppToLoad: [myAcademicProfile] DOM Match on ${sceneKey}: View Container #${appConfig.views[0]} exists.`);
                lastRenderedViewKey = appConfig.views[0]; 
                if (!appsFound.includes('myAcademicProfile')) appsFound.push('myAcademicProfile');
            }
        }
        
        // DOM check for studentCoachLauncher
        if (APPS.studentCoachLauncher && sceneKey === APPS.studentCoachLauncher.scenes[0]) { // Checks if current scene is scene_43
            const appConfig = APPS.studentCoachLauncher;
            const viewElement = document.querySelector(`#${appConfig.views[0]}`); // Check for #view_3055 container
            if (viewElement) {
                log(`findAppToLoad: [studentCoachLauncher] DOM Match on ${sceneKey}: View Container #${appConfig.views[0]} exists.`);
                lastRenderedViewKey = appConfig.views[0]; 
                if (!appsFound.includes('studentCoachLauncher')) appsFound.push('studentCoachLauncher');
            }
        }

        // DOM check for mobileReportFix
        if (APPS.mobileReportFix && sceneKey === APPS.mobileReportFix.scenes[0]) { // Checks if current scene is scene_43
            const appConfig = APPS.mobileReportFix;
            const viewElement = document.querySelector(`#${appConfig.views[0]}`); // Check for #view_3041 container
            if (viewElement) {
                log(`findAppToLoad: [mobileReportFix] DOM Match on ${sceneKey}: View Container #${appConfig.views[0]} exists.`);
                lastRenderedViewKey = appConfig.views[0]; 
                if (!appsFound.includes('mobileReportFix')) appsFound.push('mobileReportFix');
            }
        }

        // DOM checks for scene_1095 (reportProfiles, aiCoachLauncher, and staffMobileReportFix)
        if (sceneKey === 'scene_1095') { 
            if (APPS.reportProfiles) {
                const reportContainerSelector = APPS.reportProfiles.configBuilder(sharedConfig, sceneKey, APPS.reportProfiles.views[0]).elementSelectors.reportContainer;
                const profileContainerSelector = APPS.reportProfiles.configBuilder(sharedConfig, sceneKey, APPS.reportProfiles.views[1]).elementSelectors.profileContainer;
                if (document.querySelector(reportContainerSelector) && document.querySelector(profileContainerSelector)) {
                    log(`findAppToLoad: [reportProfiles] DOM Match on ${sceneKey}: Both required views/elements found.`);
                    if (!appsFound.includes('reportProfiles')) appsFound.push('reportProfiles');
                }
            }
            if (APPS.aiCoachLauncher) {
                const aiCoachAppConfig = APPS.aiCoachLauncher;
                const elementSelectorToCheck = aiCoachAppConfig.configBuilder(sharedConfig, sceneKey, aiCoachAppConfig.views[0]).elementSelector;
                if (document.querySelector(elementSelectorToCheck)) {
                    log(`findAppToLoad: [aiCoachLauncher] DOM Match on ${sceneKey}: Element '${elementSelectorToCheck}' exists.`);
                    lastRenderedViewKey = aiCoachAppConfig.views[0]; 
                    if (!appsFound.includes('aiCoachLauncher')) appsFound.push('aiCoachLauncher');
                } 
            }
            if (APPS.staffMobileReportFix) {
                const staffMobileAppConfig = APPS.staffMobileReportFix;
                const elementSelectorToCheck = staffMobileAppConfig.configBuilder(sharedConfig, sceneKey, staffMobileAppConfig.views[0]).elementSelector;
                if (document.querySelector(elementSelectorToCheck)) {
                    log(`findAppToLoad: [staffMobileReportFix] DOM Match on ${sceneKey}: Element '${elementSelectorToCheck}' exists.`);
                    if (!appsFound.includes('staffMobileReportFix')) appsFound.push('staffMobileReportFix');
                }
            }
            if (APPS.dynamicStaffTable1014) {
                // Check if view_2776 exists (where the tutor table is)
                const viewElement = document.querySelector('#view_2776');
                if (viewElement) {
                    log(`findAppToLoad: [dynamicStaffTable1014] DOM Match on ${sceneKey}: View container #view_2776 exists.`);
                    if (!appsFound.includes('dynamicStaffTable1014')) appsFound.push('dynamicStaffTable1014');
                }
            }

        }
        // DOM checks for scene_1014 (reportProfiles, aiCoachLauncher, and staffMobileReportFix)
        if (sceneKey === 'scene_1014') { 
            if (APPS.reportProfiles) {
                const reportContainerSelector = APPS.reportProfiles.configBuilder(sharedConfig, sceneKey, 'view_2772').elementSelectors.reportContainer;
                // Also check for the profile container in view_3204
                const profileContainerSelector = '#view_3204 .kn-rich_text__content';
                if (document.querySelector(reportContainerSelector)) {
                    log(`findAppToLoad: [reportProfiles] DOM Match on ${sceneKey}: Report container found.`);
                    if (!appsFound.includes('reportProfiles')) appsFound.push('reportProfiles');
                }
                // Check if view_3204 exists for profile display
                if (document.querySelector(profileContainerSelector)) {
                    log(`findAppToLoad: [reportProfiles] Profile container found in view_3204`);
                    if (!appsFound.includes('reportProfiles')) appsFound.push('reportProfiles');
                }
            }
            if (APPS.aiCoachLauncher) {
                const aiCoachAppConfig = APPS.aiCoachLauncher;
                // For scene_1014, check for view_2772 instead of view_3047
                const elementSelectorToCheck = '#view_2772 .kn-rich_text__content';
                if (document.querySelector(elementSelectorToCheck)) {
                    log(`findAppToLoad: [aiCoachLauncher] DOM Match on ${sceneKey}: Element '${elementSelectorToCheck}' exists.`);
                    lastRenderedViewKey = 'view_2772'; 
                    if (!appsFound.includes('aiCoachLauncher')) appsFound.push('aiCoachLauncher');
                } 
            }
            if (APPS.staffMobileReportFix) {
                const staffMobileAppConfig = APPS.staffMobileReportFix;
                const elementSelectorToCheck = staffMobileAppConfig.configBuilder(sharedConfig, sceneKey, 'any').elementSelector;
                if (document.querySelector(elementSelectorToCheck)) {
                    log(`findAppToLoad: [staffMobileReportFix] DOM Match on ${sceneKey}: Element '${elementSelectorToCheck}' exists.`);
                    if (!appsFound.includes('staffMobileReportFix')) appsFound.push('staffMobileReportFix');
                }
            }
            if (APPS.dynamicStaffTable1014) {
                const dynamicTableAppConfig = APPS.dynamicStaffTable1014;
                // Check if the appropriate view exists based on scene
                const targetView = sceneKey === 'scene_1014' ? '#view_2772' : '#view_2776';
                const viewElement = document.querySelector(targetView);
                if (viewElement) {
                    log(`findAppToLoad: [dynamicStaffTable1014] DOM Match on ${sceneKey}: View container ${targetView} exists.`);
                    if (!appsFound.includes('dynamicStaffTable1014')) appsFound.push('dynamicStaffTable1014');
                }
            }
        }




        // DOM check for coachSummary when its scene is active
        if (sceneKey === 'scene_1224' && APPS.coachSummary) {
            const coachSummaryAppConfig = APPS.coachSummary;
            const elementSelectorToCheck = coachSummaryAppConfig.configBuilder(sharedConfig, sceneKey, coachSummaryAppConfig.views[0]).elementSelector;
            if (document.querySelector(elementSelectorToCheck)) {
                log(`findAppToLoad: [coachSummary] DOM Match on ${sceneKey}: Element '${elementSelectorToCheck}' (view_3049 container) exists.`);
                lastRenderedViewKey = coachSummaryAppConfig.views[0]; 
                if (!appsFound.includes('coachSummary')) appsFound.push('coachSummary'); // Ensure it's added if found
            }
        }
        
        // Check for apps that load on all pages (header and validator only - Google Translate disabled)
        for (const appKey of [/*'googleTranslateInit',*/ 'generalHeader', 'questionnaireValidator']) {
            if (APPS[appKey] && sceneKey) {
                log(`findAppToLoad: Checking if ${appKey} should load on ${sceneKey}`);
                const appConfig = APPS[appKey];
                // Check if scenes includes 'all' flag
                if (appConfig.scenes.includes('all')) {
                    // For questionnaireValidator, let it load for all users
                    // The script itself will check if the user is a student
                    if (appKey === 'questionnaireValidator') {
                        log(`findAppToLoad: [${appKey}] Will load for all users (student check happens in script)`);
                    }
                    log(`findAppToLoad: [${appKey}] Universal load enabled - will load on any scene`);
                    if (!appsFound.includes(appKey)) appsFound.push(appKey);
                }
            }
        }
        
        // Special scene_1215 logic - Staff landing page
        // Now only loads staffHomepageCoaching since RESOURCE users go to scene_1278
        if (sceneKey === 'scene_1215') {
            log(`findAppToLoad: Special check for scene_1215 - Staff Coaching page only`);
            
            // RESOURCE users should be redirected to scene_1278 by universalRedirect
            // If they somehow end up here, we'll still load the coaching homepage
            // but they should ideally be redirected
            
            const user = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : null;
            
            // Check if this is a RESOURCE user who shouldn't be here
            if (user) {
                let accountType = null;
                if (user.values && user.values.field_441) {
                    accountType = user.values.field_441;
                } else if (user.field_441) {
                    accountType = user.field_441;
                }
                
                if (accountType && accountType.toString().toUpperCase().includes('RESOURCE')) {
                    log(`findAppToLoad: WARNING - RESOURCE user on scene_1215, should be on scene_1278`);
                    // Consider redirecting them
                    if (window.location.hash !== '#resources-homepage/') {
                        log(`findAppToLoad: Redirecting RESOURCE user to scene_1278`);
                        window.location.hash = '#resources-homepage/';
                        return appsFound; // Return empty to prevent loading
                    }
                }
            }
            
            // Load coaching homepage for all staff on this scene
            log(`findAppToLoad: Loading staffHomepageCoaching for scene_1215`);
            appsFound.push('staffHomepageCoaching');
        }
                
        // Standard scene/view matching for all other apps (should always run to find page-specific apps)
        if (sceneKey && viewKey && typeof sceneKey === 'string' && typeof viewKey === 'string') {
            log(`findAppToLoad: Standard Search: Searching for app matching Scene Key: ${sceneKey}, View Key: ${viewKey}`);
            for (const key in APPS) {
                // Debug log for universalRedirect
                if (key === 'universalRedirect') {
                    log(`findAppToLoad: Checking universalRedirect - scenes: ${APPS[key].scenes}, current scene: ${sceneKey}`);
                }
                
                // Avoid re-processing apps already handled by DOM checks (or intended for DOM checks)
                if ((sceneKey === APPS.myAcademicProfile?.scenes[0] && key === 'myAcademicProfile') ||
                    (sceneKey === APPS.studentCoachLauncher?.scenes[0] && key === 'studentCoachLauncher') || 
                    (sceneKey === APPS.mobileReportFix?.scenes[0] && key === 'mobileReportFix') ||
                    (sceneKey === 'scene_1095' && (key === 'reportProfiles' || key === 'aiCoachLauncher' || key === 'staffMobileReportFix')) ||
                    (sceneKey === 'scene_1014' && (key === 'reportProfiles' || key === 'aiCoachLauncher' || key === 'staffMobileReportFix' || key === 'dynamicStaffTable1014')) ||
                    (sceneKey === 'scene_1224' && key === 'coachSummary') ||
                    (key === 'generalHeader') || // Skip generalHeader as it uses special 'all' flag
                    (key === 'questionnaireValidator') || // Skip questionnaireValidator as it uses special 'all' flag
                    (sceneKey === 'scene_1215' && key === 'staffHomepageCoaching')) {
                    continue; 
                }
                const app = APPS[key];
                const sceneMatch = app.scenes.includes(sceneKey);
                const viewMatch = app.views.includes(viewKey) || app.views.includes('any');
                if (sceneMatch && viewMatch) {
                    log(`findAppToLoad: Standard Match found for app '${key}'.`);
                    if (!appsFound.includes(key)) {
                        appsFound.push(key);
                    }
                }
            }
        }


        if (appsFound.length > 0) {
            // Remove duplicates just in case (though current logic should prevent it)
            const uniqueAppsFound = [...new Set(appsFound)];
            log(`findAppToLoad: Apps identified for loading: ${uniqueAppsFound.join(', ')}`);
            return uniqueAppsFound;
        }
        
        log(`findAppToLoad: No app configuration found for Scene '${sceneKey}', View '${viewKey}'.`);
        return null;
    }

    // Helper function to cleanup apps for a specific scene
    window.cleanupAppsForScene = function(sceneKey) {
        log(`cleanupAppsForScene: Cleaning up apps for scene ${sceneKey}`);
        
        // Find all apps that should load on this scene
        for (const appKey in APPS) {
            const app = APPS[appKey];
            if (app.scenes.includes(sceneKey)) {
                log(`cleanupAppsForScene: Clearing state for ${appKey}`);
                
                // Clear loading flag
                window[`_loading_${appKey}`] = false;
                
                // Clear global config
                // Special handling for uploadSystem - don't try to clear VESPA_UPLOAD_CONFIG as it's a const
                if (appKey === 'uploadSystem' && app.configGlobalVar === 'VESPA_UPLOAD_CONFIG') {
                    log(`cleanupAppsForScene: Skipping clear of VESPA_UPLOAD_CONFIG (const cannot be reassigned)`);
                    // Don't clear initialization flags - let the upload system manage its own state
                } else if (app.configGlobalVar && window[app.configGlobalVar]) {
                    window[app.configGlobalVar] = undefined;
                }
                
                // Reset loaded app key if this was it
                if (loadedAppKey === appKey) {
                    loadedAppKey = null;
                }
                
                // Special cleanup for specific apps
                if (appKey === 'studentResultsViewer') {
                    // Clear any cached data
                    const container = document.querySelector('#view_3214 .kn-rich_text__content');
                    if (container) container.innerHTML = '';
                }
                if (appKey === 'dynamicStaffTable1014') {
                    // Remove enhanced class from tables
                    const tables = document.querySelectorAll('table.enhanced');
                    tables.forEach(table => table.classList.remove('enhanced'));
                }
            }
        }
    };

    // Central function to check conditions and load the app
    async function tryLoadApp() {
        let effectiveSceneKey = (typeof Knack !== 'undefined' && Knack.scene && Knack.scene.key) ? Knack.scene.key : lastRenderedSceneKey;
        
        log(`tryLoadApp: Checking load conditions. Effective Scene: ${effectiveSceneKey}, Last Rendered View: ${lastRenderedViewKey}`);
        
        // Check if forced reload is requested for this scene
        if (window._forceAppReload === effectiveSceneKey) {
            log(`tryLoadApp: Force reload requested for scene ${effectiveSceneKey}`);
            window._forceAppReload = null; // Clear the flag
            
            // Clean up any existing apps for this scene
            window.cleanupAppsForScene(effectiveSceneKey);
        }
        
        let appKeysToLoad = findAppToLoad(effectiveSceneKey, lastRenderedViewKey);

        if (!appKeysToLoad || appKeysToLoad.length === 0) {
            log("tryLoadApp: No app matches current scene/view with effectiveSceneKey.");
             if (effectiveSceneKey !== lastRenderedSceneKey && lastRenderedSceneKey) {
                log(`tryLoadApp: Retrying findAppToLoad with lastRenderedSceneKey: ${lastRenderedSceneKey}`);
                const fallbackAppKeys = findAppToLoad(lastRenderedSceneKey, lastRenderedViewKey);
                if (fallbackAppKeys && fallbackAppKeys.length > 0) {
                    log(`tryLoadApp: Found apps with fallback scene key: ${fallbackAppKeys.join(', ')}`);
                    appKeysToLoad = fallbackAppKeys;
                } else {
                    log("tryLoadApp: No app matches with fallback scene key either.");
                    return;
                }
            } else if (!lastRenderedSceneKey && !effectiveSceneKey) {
                 log("tryLoadApp: No scene key available to attempt loading.");
                return;
            } else {
                return; 
            }
        }
        
        const finalAppKeysToLoad = Array.isArray(appKeysToLoad) ? appKeysToLoad : (appKeysToLoad ? [appKeysToLoad] : []);

        for (const appKey of finalAppKeysToLoad) { 
            // ENHANCED VALIDATION: Ensure app should actually load on current scene
            const appConfig = APPS[appKey];
            if (appConfig && !appConfig.scenes.includes('all') && effectiveSceneKey) {
                if (!appConfig.scenes.includes(effectiveSceneKey)) {
                    log(`tryLoadApp: App '${appKey}' should not load on scene '${effectiveSceneKey}' (configured for: ${appConfig.scenes.join(', ')}), skipping`);
                    continue;
                }
            }
            
            // Skip if this app is already loaded or currently loading
            // Exception for apps that should persist or when force reload is requested
            const universalApps = ['loginPageCustomizer', 'questionnaireValidator', 'generalHeader' /*, 'googleTranslateInit' - DISABLED*/];
            const isUniversalApp = universalApps.includes(appKey);
            const isForceReload = window._forceAppReload === effectiveSceneKey;
            
            // Universal rule: Force reload all non-universal apps when navigating between scenes
            const shouldForceReload = isForceReload && !isUniversalApp;
            
            if (!isUniversalApp && !shouldForceReload && 
                (loadedAppKey === appKey || window[`_loading_${appKey}`])) {
                log(`tryLoadApp: App '${appKey}' is already loaded or currently loading, skipping`);
                continue;
            }
            
            if (shouldForceReload) {
                log(`tryLoadApp: Force reloading ${appKey} for scene ${effectiveSceneKey} (universal rule)`);
                window[`_loading_${appKey}`] = false;
                if (loadedAppKey === appKey) loadedAppKey = null;
            }
            
            // Mark as loading to prevent duplicate loads
            // For loginPageCustomizer and questionnaireValidator, we'll handle this differently
            if (appKey !== 'loginPageCustomizer' && appKey !== 'questionnaireValidator') {
                window[`_loading_${appKey}`] = true;
            } else if (appKey === 'questionnaireValidator') {
                // Special handling for questionnaireValidator to prevent multiple loads
                if (window._questionnaireValidatorLoaded) {
                    log(`tryLoadApp: questionnaireValidator already loaded this session, skipping`);
                    continue;
                }
                window._questionnaireValidatorLoaded = true;
            }
            
            // Special check for generalHeader - it should only load once per session
            if (appKey === 'generalHeader') {
                // Check session storage first
                if (sessionStorage.getItem('_generalHeaderLoadedSession') === 'true') {
                    if (document.getElementById('vespaGeneralHeader')) {
                        log(`tryLoadApp: GeneralHeader already loaded this session and exists in DOM, skipping`);
                        continue;
                    }
                }
                
                if (window._generalHeaderLoaded) {
                    // But check if the header actually exists in the DOM
                    if (document.getElementById('vespaGeneralHeader')) {
                        log(`tryLoadApp: GeneralHeader already loaded and exists in DOM, skipping`);
                        sessionStorage.setItem('_generalHeaderLoadedSession', 'true');
                        continue;
                    } else {
                        log(`tryLoadApp: GeneralHeader flag set but header not in DOM, clearing flag and reloading`);
                        window._generalHeaderLoaded = false;
                    }
                }
            }
            
            // For staff homepage apps, wait for GeneralHeader to complete if it's loading
            if (appKey === 'staffHomepageCoaching' && 
                window._generalHeaderLoaded && !window._generalHeaderInitComplete) {
                log(`tryLoadApp: Waiting for GeneralHeader to complete before loading ${appKey}`);
                window[`_loading_${appKey}`] = false; // Clear loading flag
                setTimeout(() => tryLoadApp(), 100); // Retry after delay
                return;
            }
            
            const appConfigDef = APPS[appKey]; 
            // Special handling for apps without external scripts (like loginPageCustomizer)
            if (!appConfigDef || (!appConfigDef.scriptUrl && !appConfigDef.customInitializer) || !appConfigDef.configBuilder || !appConfigDef.configGlobalVar) {
                errorLog(`tryLoadApp: Configuration error for app (missing required properties): ${appKey}`, appConfigDef);
                if (appKey !== 'loginPageCustomizer' && appKey !== 'questionnaireValidator') {
                    window[`_loading_${appKey}`] = false; // Clear loading flag
                }
                continue; 
            }
            // Special delay for Vue app initialization on both staff admin and tutor pages
            if ((effectiveSceneKey === 'scene_1014' || effectiveSceneKey === 'scene_1095') && appKey === 'dynamicStaffTable1014') {
                log(`tryLoadApp: Adding delay for Vue app initialization on ${effectiveSceneKey}`);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            // Special delay for scene_1284 to allow scene_43 cleanup
            if (effectiveSceneKey === 'scene_1284' && (appKey === 'reportV2' || appKey === 'academicProfileV2')) {
                log(`tryLoadApp: Adding delay for scene_1284 to allow scene_43 cleanup`);
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            try {
                let currentViewForConfig = lastRenderedViewKey; 
                if (appConfigDef.views.includes(lastRenderedViewKey)) {
                    currentViewForConfig = lastRenderedViewKey;
                } else if (appConfigDef.views.length > 0) {
                    currentViewForConfig = appConfigDef.views[0];
                } else {
                    log(`tryLoadApp: No suitable view found for ${appKey} in its configuration. Using empty string.`);
                    currentViewForConfig = ''; 
                }

                let sceneKeyForConfig = (typeof Knack !== 'undefined' && Knack.scene && appConfigDef.scenes.includes(Knack.scene.key)) 
                                        ? Knack.scene.key 
                                        : (appConfigDef.scenes.includes(effectiveSceneKey) 
                                            ? effectiveSceneKey 
                                            : (lastRenderedSceneKey && appConfigDef.scenes.includes(lastRenderedSceneKey) 
                                                ? lastRenderedSceneKey 
                                                : appConfigDef.scenes[0]));
                
                if (!sceneKeyForConfig) {
                     errorLog(`tryLoadApp: Critical - Cannot determine sceneKeyForConfig for app ${appKey}. App configured scenes: ${appConfigDef.scenes.join('/')}. Runtime effective: ${effectiveSceneKey}, lastRendered: ${lastRenderedSceneKey}. Skipping load.`);
                    continue;
                }
                log(`tryLoadApp: Using sceneKey '${sceneKeyForConfig}' and viewKey '${currentViewForConfig}' for ${appKey} config.`);
                const instanceConfig = appConfigDef.configBuilder(sharedConfig, sceneKeyForConfig, currentViewForConfig); 
                
                // Skip if configBuilder returns null (e.g., questionnaireValidator for non-students)
                if (instanceConfig === null) {
                    log(`tryLoadApp: Config builder returned null for ${appKey}, skipping`);
                    window[`_loading_${appKey}`] = false;
                    continue;
                }
                
                log(`tryLoadApp: Built instance config for ${appKey}`, instanceConfig);

                // Load dependencies if specified (e.g., WordCloud2 for dashboard)
                if (appConfigDef.dependencies && Array.isArray(appConfigDef.dependencies)) {
                    log(`tryLoadApp: Loading dependencies for ${appKey}...`);
                    for (const depUrl of appConfigDef.dependencies) {
                        try {
                            await loadScript(depUrl);
                            log(`tryLoadApp: Dependency loaded: ${depUrl}`);
                        } catch (depError) {
                            errorLog(`tryLoadApp: Failed to load dependency ${depUrl}:`, depError);
                            // Continue anyway - some dependencies might be optional
                        }
                    }
                }
                
                // Load CSS if specified
                if (appConfigDef.cssUrl) {
                    log(`tryLoadApp: Loading CSS for ${appKey} from ${appConfigDef.cssUrl}...`);
                    try {
                        await loadCSS(appConfigDef.cssUrl);
                        log(`tryLoadApp: CSS for ${appKey} loaded successfully.`);
                    } catch (cssError) {
                        errorLog(`tryLoadApp: Failed to load CSS for ${appKey}:`, cssError);
                        // Continue anyway - CSS failure shouldn't prevent functionality
                    }
                }

                // Check if this app has a custom initializer or needs to load an external script
                if (appConfigDef.scriptUrl) {
                    // Special handling for uploadSystem to prevent duplicate script loading
                    if (appKey === 'uploadSystem') {
                        // Check if upload system script is already loaded
                        if (window._uploadSystemScriptLoaded && typeof window.initializeUploadBridge === 'function') {
                            log(`tryLoadApp: Upload system script already loaded, skipping script load for ${appKey}`);
                        } else {
                            log(`tryLoadApp: Attempting to load script for ${appKey} from URL: ${appConfigDef.scriptUrl}`);
                            try {
                                await loadScript(appConfigDef.scriptUrl);
                                window._uploadSystemScriptLoaded = true;
                                log(`tryLoadApp: Script successfully loaded for app '${appKey}'.`);
                            } catch (loadError) {
                                errorLog(`tryLoadApp: Failed to load script for ${appKey}:`, loadError);
                                continue;
                            }
                        }
                    } else {
                        log(`tryLoadApp: Attempting to load script for ${appKey} from URL: ${appConfigDef.scriptUrl}`);
                        try {
                            await loadScript(appConfigDef.scriptUrl);
                            log(`tryLoadApp: Script successfully loaded for app '${appKey}'.`);
                            
                            // Add debug check for dashboard
                            if (appKey === 'dashboard') {
                                log(`tryLoadApp: Checking for initializeVueDashboard function...`);
                                if (typeof window.initializeVueDashboard === 'function') {
                                    log(`tryLoadApp: initializeVueDashboard function found!`);
                                } else {
                                    errorLog(`tryLoadApp: initializeVueDashboard function NOT found! Script may not have executed properly.`);
                                }
                            }
                            

                        } catch (loadError) {
                            errorLog(`tryLoadApp: Failed to load script for ${appKey}:`, loadError);
                            continue;
                        }
                    }
                } else if (appConfigDef.customInitializer) {
                    log(`tryLoadApp: No external script for ${appKey}, will use custom initializer`);
                }

                // Handle scene-level rendering BEFORE setting config and calling initializer
                if (instanceConfig.renderMode === 'scene-level') {
                    log(`tryLoadApp: Applying scene-level rendering for ${appKey}`);
                    applySceneLevelRendering(instanceConfig, sceneKeyForConfig, appKey);
                }

                // Special handling for uploadSystem config to prevent const redeclaration
                if (appKey === 'uploadSystem' && window.VESPA_UPLOAD_CONFIG) {
                    log(`tryLoadApp: VESPA_UPLOAD_CONFIG already exists, updating it instead of overwriting`);
                    // Update existing config properties but preserve any existing state
                    const existingState = window.VESPA_UPLOAD_CONFIG.state || {};
                    Object.assign(window.VESPA_UPLOAD_CONFIG, instanceConfig);
                    if (Object.keys(existingState).length > 0) {
                        window.VESPA_UPLOAD_CONFIG.state = existingState;
                        log(`tryLoadApp: Preserved existing upload system state`);
                    }
                } else {
                    window[appConfigDef.configGlobalVar] = instanceConfig;
                }
                log(`tryLoadApp: Set global config variable '${appConfigDef.configGlobalVar}' for ${appKey}`);

                // Check if there's an initializer function to call
                if (appConfigDef.customInitializer) {
                    log(`tryLoadApp: Calling custom initializer for ${appKey}`); 
                    try {
                        appConfigDef.customInitializer();
                        log(`tryLoadApp: Custom initializer called successfully for ${appKey}.`);
                    } catch (initError) {
                        errorLog(`tryLoadApp: Error calling custom initializer for ${appKey}:`, initError);
                        window[appConfigDef.configGlobalVar] = undefined; 
                        continue; // Try next app
                    }
                } else if (appConfigDef.initializerFunctionName !== null) {
                    // Special check for uploadSystem - don't re-initialize if already active
                    if (appKey === 'uploadSystem' && window._uploadSystemInitialized) {
                        // Check if the upload system is in an active state
                        const uploadContainer = document.querySelector('#view_3020 .kn-rich_text__content');
                        const hasActiveWizard = uploadContainer && uploadContainer.querySelector('.vespa-upload-wizard');
                        const hasActiveModule = uploadContainer && (
                            uploadContainer.querySelector('#account-management-container') ||
                            uploadContainer.querySelector('#renewal-management-container')
                        );
                        
                        if (hasActiveWizard || hasActiveModule) {
                            log(`tryLoadApp: Upload system has active state, skipping re-initialization`);
                            log(`tryLoadApp: Active wizard: ${hasActiveWizard}, Active module: ${hasActiveModule}`);
                            continue; // Skip re-initialization to preserve state
                        }
                    }
                    
                    if (typeof window[appConfigDef.initializerFunctionName] === 'function') {
                        log(`tryLoadApp: Calling initializer function: ${appConfigDef.initializerFunctionName} for ${appKey}`); 
                        try {
                            // For scene-level rendering, add a small delay to ensure DOM is ready
                            if (instanceConfig.renderMode === 'scene-level') {
                                setTimeout(() => {
                                    try {
                                        // Double-check the container exists before initializing
                                        const container = document.querySelector(instanceConfig.elementSelector);
                                        if (!container) {
                                            errorLog(`tryLoadApp: Scene-level container not found for ${appKey}, selector: ${instanceConfig.elementSelector}`);
                                            // Log what containers do exist
                                            const allContainers = document.querySelectorAll('[id^="scene-level-container"]');
                                            log(`tryLoadApp: Found ${allContainers.length} scene-level containers:`, Array.from(allContainers).map(c => c.id));
                                            return;
                                        }
                                        
                                        log(`tryLoadApp: About to call ${appConfigDef.initializerFunctionName} for ${appKey}`);
                                        const result = window[appConfigDef.initializerFunctionName]();
                                        log(`tryLoadApp: Initializer function ${appConfigDef.initializerFunctionName} returned for ${appKey}`, result);
                                        
                                        // Clear loading message if it exists
                                        const loadingMsg = document.getElementById('scene-loading-message');
                                        if (loadingMsg) {
                                            loadingMsg.remove();
                                            log(`tryLoadApp: Cleared loading message for ${appKey}`);
                                        }
                                    } catch (delayedError) {
                                        errorLog(`tryLoadApp: Error calling delayed initializer for ${appKey}:`, delayedError);
                                        errorLog(`tryLoadApp: Error stack:`, delayedError.stack);
                                    }
                                }, 250); // Increased delay more
                            } else {
                                window[appConfigDef.initializerFunctionName]();
                                log(`tryLoadApp: Initializer function ${appConfigDef.initializerFunctionName} called successfully for ${appKey}.`);
                            }
                        } catch (initError) {
                            errorLog(`tryLoadApp: Error calling initializer function ${appConfigDef.initializerFunctionName} for ${appKey}:`, initError);
                            window[appConfigDef.configGlobalVar] = undefined; 
                            continue; // Try next app
                        }
                    } else {
                        errorLog(`tryLoadApp: Initializer function '${appConfigDef.initializerFunctionName}' not found after loading script for app '${appKey}'.`);
                        window[appConfigDef.configGlobalVar] = undefined; 
                        continue; // Try next app
                    }
                } else {
                    log(`tryLoadApp: No initializer function configured for ${appKey} (self-executing script).`);
                }

                // Update loadedAppKey only on successful initialization
                if (!['reportProfiles', 'aiCoachLauncher', 'generalHeader', 'loginPageCustomizer', 'questionnaireValidator'].includes(appKey)) {
                    loadedAppKey = appKey;
                }
                
                // Set global flag for generalHeader
                if (appKey === 'generalHeader') {
                    window._generalHeaderLoaded = true;
                    window._generalHeaderInitComplete = true; // New flag to track completion
                    log(`tryLoadApp: Set global flag _generalHeaderLoaded = true`);
                }
                
                // Set global flag for uploadSystem 
                if (appKey === 'uploadSystem') {
                    window._uploadSystemInitialized = true;
                    log(`tryLoadApp: Set global flag _uploadSystemInitialized = true`);
                    // Store a reference to preserve state across navigation
                    if (window.VESPAUpload && window.VESPAUpload.getState) {
                        window._uploadSystemPreservedState = window.VESPAUpload.getState();
                        log(`tryLoadApp: Stored upload system state for preservation`);
                    }
                }
                
                // Clear the pending decision flag for dashboard apps
                if (appKey === 'staffHomepageCoaching') {
                    window._pendingDashboardDecision = false;
                }
                
                // Clear loading flag on success
                // For loginPageCustomizer and questionnaireValidator, don't keep the loading flag to allow re-runs
                if (appKey !== 'loginPageCustomizer' && appKey !== 'questionnaireValidator') {
                    window[`_loading_${appKey}`] = false;
                }
                
                // TRANSLATION SUPPORT: Refresh translations after app loads
                // Give extra time for complex apps to fully render
                const translationDelay = getTranslationDelayForApp(appKey);
                if (translationDelay > 0) {
                    setTimeout(() => {
                        log(`tryLoadApp: Refreshing translations for ${appKey}`);
                        if (window.refreshTranslations && typeof window.refreshTranslations === 'function') {
                            window.refreshTranslations();
                        }
                        // Notify app that translation is available if needed
                        $(document).trigger('vespa-translation-refreshed', { appKey: appKey });
                    }, translationDelay);
                }

            } catch (error) {
                errorLog(`tryLoadApp: Failed during load/init process for app ${appKey}:`, error);
                if (appConfigDef && appConfigDef.configGlobalVar) {
                    window[appConfigDef.configGlobalVar] = undefined;
                }
                // Clear loading flag on error
                if (appKey !== 'loginPageCustomizer' && appKey !== 'questionnaireValidator') {
                    window[`_loading_${appKey}`] = false;
                }
            }
        }
    }

    // --- Main Execution (jQuery Document Ready) ---
    $(function () {
        // ... (DOM ready and event listener attachment remains the same) ...
        log("DOM ready. Attaching Knack event listeners.");

        if (typeof $ === 'undefined' || typeof $.ajax === 'undefined') {
            errorLog("Critical Error: jQuery ($) is not available at DOM ready.");
            return;
        }
        log("jQuery confirmed available.");
        
        // ENSURE jQuery IS GLOBALLY AVAILABLE FOR ALL APPS
        if (typeof jQuery === 'undefined' && typeof $ !== 'undefined') {
            window.jQuery = $;
            log("Assigned $ to window.jQuery for compatibility with libraries expecting jQuery global.");
        }

        // Listener 1: Store scene key and then check if conditions are met
        $(document).on('knack-scene-render.any', function (event, scene) {
            if (scene && scene.key) {
                // Universal loading screen for scene_1014 and scene_1095 to prevent flash of unstyled content
                if (scene.key === 'scene_1014' || scene.key === 'scene_1095') {
                    const sceneId = scene.key;
                    
                    // Check if loading screen is already active (from navigation)
                    if (window._loadingScreenActive) {
                        log('[Scene Loading] Loading screen already active from navigation, reusing it');
                        // Just update the progress text if needed
                        if (window.VespaLoadingScreen && window.VespaLoadingScreen.isActive()) {
                            window.VespaLoadingScreen.updateProgress('Loading components...');
                        }
                        // Skip creating new loading screen elements since one is already active
                    } else {
                        log('[Scene Loading] No active loading screen, creating one for scene render');
                        
                        // Add loading screen styles
                        const loadingStyle = document.createElement('style');
                        loadingStyle.id = `${sceneId}-loading-screen`;
                        loadingStyle.textContent = `
                        /* Universal loading screen for ${sceneId} */
                        .vespa-loading-overlay {
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: linear-gradient(135deg, #2a3c7a 0%, #079baa 100%);
                            z-index: 9999;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            transition: opacity 0.5s ease-out;
                        }
                        
                        .vespa-loading-overlay.fade-out {
                            opacity: 0;
                            pointer-events: none;
                        }
                        
                        .vespa-loading-content {
                            text-align: center;
                            color: white;
                        }
                        
                        .vespa-loading-logo {
                            width: 150px;
                            height: auto;
                            margin-bottom: 30px;
                            animation: loadingPulse 1.5s ease-in-out infinite;
                        }
                        
                        .vespa-loading-spinner {
                            width: 60px;
                            height: 60px;
                            border: 4px solid rgba(255, 255, 255, 0.3);
                            border-top-color: white;
                            border-radius: 50%;
                            animation: loadingSpin 1s linear infinite;
                            margin: 0 auto 20px;
                        }
                        
                        .vespa-loading-text {
                            font-size: 18px;
                            font-weight: 300;
                            letter-spacing: 1px;
                            opacity: 0.9;
                            animation: loadingFade 2s ease-in-out infinite;
                        }
                        
                        .vespa-loading-progress {
                            margin-top: 15px;
                            font-size: 14px;
                            opacity: 0.7;
                        }
                        
                        @keyframes loadingSpin {
                            to { transform: rotate(360deg); }
                        }
                        
                        @keyframes loadingPulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                        }
                        
                        @keyframes loadingFade {
                            0%, 100% { opacity: 0.9; }
                            50% { opacity: 0.6; }
                        }
                        
                        /* Hide content initially */
                        body.loading-scene #kn-${sceneId} {
                            visibility: hidden !important;
                        }
                        
                        body.loading-scene .vespa-general-header {
                            opacity: 0 !important;
                        }
                        
                        /* Specific hiding for problematic views */
                        ${sceneId === 'scene_1014' ? '#view_2772, #view_3204' : '#view_2776, #view_3015'} {
                            opacity: 0 !important;
                            transition: opacity 0.3s ease-in-out;
                        }
                        
                        /* When ready, show everything */
                        body.scene-ready #kn-${sceneId} {
                            visibility: visible !important;
                        }
                        
                        body.scene-ready .vespa-general-header {
                            opacity: 1 !important;
                        }
                        
                        body.scene-ready ${sceneId === 'scene_1014' ? '#view_2772, #view_3204' : '#view_2776, #view_3015'} {
                            opacity: 1 !important;
                        }
                    `;
                        
                        // Only add styles if they don't exist
                        if (!document.getElementById(`${sceneId}-loading-screen`)) {
                            document.head.appendChild(loadingStyle);
                        }
                        
                        // Use universal loading screen if available and not already active
                        // Skip if _skipLoadingScreen flag is set (manage page already loaded)
                        if (!window._skipLoadingScreen && window.VespaLoadingScreen && !window.VespaLoadingScreen.isActive()) {
                            window.VespaLoadingScreen.showForPageLoad(sceneId);
                            window._loadingScreenActive = true;
                        } else if (!window._skipLoadingScreen && !document.getElementById('vespa-universal-loading-overlay') && !document.getElementById('vespa-loading-overlay')) {
                            // Fallback if universal loading screen not available
                            const loadingText = sceneId === 'scene_1014' ? 'Loading VESPA Staff Portal' : 'Loading VESPA Staff Portal';
                            const loadingHTML = `
                                <div class="vespa-loading-overlay" id="vespa-loading-overlay">
                                    <div class="vespa-loading-content">
                                        <img src="https://vespa.academy/_astro/vespalogo.BGrK1ARl.png" alt="VESPA" class="vespa-loading-logo">
                                        <div class="vespa-loading-spinner"></div>
                                        <div class="vespa-loading-text">${loadingText}</div>
                                        <div class="vespa-loading-progress" id="loading-progress">Initializing...</div>
                                    </div>
                                </div>
                            `;
                            
                            document.body.insertAdjacentHTML('beforeend', loadingHTML);
                            document.body.classList.add('loading-scene');
                            window._loadingScreenActive = true;
                        }
                    }
                    
                    // Coordinated ready check system (always run regardless of loading screen source)
                    let componentsStatus = {
                        header: false,
                        vueApp: false,
                        table: false,
                        profile: false
                    };
                    
                    let checkReadyInterval;
                    let readyCheckCount = 0;
                    const maxReadyChecks = 60; // 15 seconds max
                    
                    const updateLoadingProgress = (text) => {
                        const progressEl = document.getElementById('loading-progress');
                        if (progressEl) progressEl.textContent = text;
                    };
                    
                    const checkIfReady = () => {
                        readyCheckCount++;
                        
                        // Check each component
                        if (!componentsStatus.header) {
                            componentsStatus.header = !!document.getElementById('vespaGeneralHeader');
                            if (componentsStatus.header) updateLoadingProgress('Navigation loaded...');
                        }
                        
                        if (!componentsStatus.vueApp) {
                            const tableView = sceneId === 'scene_1014' ? '#view_2772' : '#view_2776';
                            const hasError = document.querySelector(`${tableView} .error, ${tableView} .exception`);
                            const hasTable = document.querySelector(`${tableView} table, ${tableView} [data-v-app]`);
                            componentsStatus.vueApp = !hasError && hasTable;
                            if (componentsStatus.vueApp) updateLoadingProgress('Dashboard loaded...');
                        }
                        
                        if (!componentsStatus.table) {
                            const tableView = sceneId === 'scene_1014' ? '#view_2772' : '#view_2776';
                            componentsStatus.table = !!document.querySelector(`${tableView} table.enhanced, ${tableView} table`);
                            if (componentsStatus.table) updateLoadingProgress('Table ready...');
                        }
                        
                        if (!componentsStatus.profile) {
                            const profileView = sceneId === 'scene_1014' ? '#view_3204' : '#view_3015';
                            // Profile might not always be needed, so check after a delay
                            componentsStatus.profile = readyCheckCount > 8 || !!document.querySelector(`${profileView}.profile-loaded`);
                        }
                        
                        // Check if enough components are ready or timeout reached
                        const essentialReady = componentsStatus.header && componentsStatus.vueApp && componentsStatus.table;
                        const timeoutReached = readyCheckCount >= maxReadyChecks;
                        
                        if (essentialReady || timeoutReached) {
                            clearInterval(checkReadyInterval);
                            
                            // Remove loading screen
                            if (window.VespaLoadingScreen && window.VespaLoadingScreen.isActive()) {
                                window.VespaLoadingScreen.updateProgress('Ready!');
                                window.VespaLoadingScreen.hide();
                            } else {
                                // Fallback removal for old loading screens
                                const loadingOverlay = document.getElementById('vespa-loading-overlay') || 
                                                      document.getElementById('vespa-universal-loading-overlay');
                                if (loadingOverlay) {
                                    updateLoadingProgress('Ready!');
                                    loadingOverlay.classList.add('fade-out');
                                    setTimeout(() => {
                                        loadingOverlay.remove();
                                        // Also remove loading styles if present
                                        const loadingStyles = document.getElementById('vespa-loading-styles');
                                        if (loadingStyles) loadingStyles.remove();
                                    }, 500);
                                }
                            }
                            
                            // Clear loading screen flag
                            window._loadingScreenActive = false;
                            
                            // Show all content
                            document.body.classList.remove('loading-scene');
                            document.body.classList.add('scene-ready');
                            document.body.style.overflow = ''; // Restore scrolling
                            
                            log(`[Scene ${sceneId}] Loading complete. Components status:`, componentsStatus);
                        }
                    };
                    
                    // Start checking after a brief delay to let components initialize
                    setTimeout(() => {
                        updateLoadingProgress('Loading components...');
                        checkReadyInterval = setInterval(checkIfReady, 250);
                    }, 500);
                }
                // If the scene is changing, reset loadedAppKey to allow reinitialization if needed
                // This is important if navigating back and forth between scenes that use different apps
                // or the same app that needs a fresh start.
                // EXCEPT for generalHeader and loginPageCustomizer which should persist/re-run across scenes
                if (lastRenderedSceneKey && lastRenderedSceneKey !== scene.key) {
                                    log(`Scene changed from ${lastRenderedSceneKey} to ${scene.key}.`);
                                    
                // UNIVERSAL BACKGROUND CLEANUP: Always clean up backgrounds when changing scenes
                const landingPageScenes = ['scene_1210', 'scene_1215', 'scene_1278']; // Updated to new resource scene
                const dashboardScene = 'scene_1225';
                const specialBackgroundScenes = [...landingPageScenes, dashboardScene];
                
                // Always clean up backgrounds when leaving ANY scene (universal rule)
                log(`Universal background cleanup for scene transition from ${lastRenderedSceneKey} to ${scene.key}`);
                
                // Remove all background styles
                document.body.style.backgroundColor = '';
                document.body.style.background = '';
                document.body.style.backgroundImage = '';
                document.body.style.backgroundAttachment = '';
                document.body.style.minHeight = '';
                
                // Remove all special classes
                document.body.classList.remove('landing-page-scene', 'dashboard-scene');
                landingPageScenes.forEach(lpScene => {
                    document.body.classList.remove(`landing-page-${lpScene}`);
                });
                
                // Clean up containers too
                const containers = document.querySelectorAll('.kn-scene, .kn-scene-content, .kn-content, #kn-app-container');
                containers.forEach(container => {
                    container.style.backgroundColor = '';
                    container.style.background = '';
                    container.style.backgroundImage = '';
                });
                
                // UNIVERSAL APP CLEANUP: Force cleanup for all scene changes (with smart exceptions)
                log(`Universal app cleanup for scene ${scene.key}`);
                
                // Get all apps that should NOT persist across scenes
                const appsToReset = [];
                for (const appKey in APPS) {
                    const app = APPS[appKey];
                    // Skip universal apps that should persist
                    if (app.scenes.includes('all') || 
                        appKey === 'generalHeader' || 
                        appKey === 'loginPageCustomizer' || 
                        appKey === 'questionnaireValidator' /*||
                        appKey === 'googleTranslateInit' - DISABLED*/) {
                        continue;
                    }
                    // Add all other apps to reset list
                    appsToReset.push(appKey);
                }
                
                // Clear all non-universal apps
                appsToReset.forEach(appKey => {
                    if (window[`_loading_${appKey}`]) {
                        window[`_loading_${appKey}`] = false;
                        log(`Cleared loading flag for ${appKey}`);
                    }
                    if (APPS[appKey] && APPS[appKey].configGlobalVar) {
                        // Special handling for uploadSystem - don't try to clear VESPA_UPLOAD_CONFIG as it's a const
                        if (appKey === 'uploadSystem' && APPS[appKey].configGlobalVar === 'VESPA_UPLOAD_CONFIG') {
                            log(`Skipping clear of VESPA_UPLOAD_CONFIG for ${appKey} (const cannot be reassigned)`);
                        } else {
                            window[APPS[appKey].configGlobalVar] = undefined;
                            log(`Cleared config for ${appKey}`);
                        }
                    }
                    if (loadedAppKey === appKey) {
                        loadedAppKey = null;
                        log(`Reset loadedAppKey from ${appKey}`);
                    }
                });
                
                // Clear any DOM remnants universally
                const tablesToReset = document.querySelectorAll('table.enhanced');
                tablesToReset.forEach(table => {
                    table.classList.remove('enhanced');
                    table.style.opacity = '1';
                });
                
                // Clear any rich text containers that might have app content
                const richTextContainers = document.querySelectorAll('.kn-rich_text__content');
                richTextContainers.forEach(container => {
                    // Only clear if it looks like app content (has certain classes or attributes)
                    if (container.querySelector('[data-app-content]') || 
                        container.querySelector('.vespa-app') ||
                        container.querySelector('.report-content')) {
                        container.innerHTML = '';
                    }
                });
                
                // Clean up any persisting role selection modals
                if (typeof window.cleanupRoleSelectionModal === 'function') {
                    window.cleanupRoleSelectionModal();
                    log('Cleaned up role selection modal on scene change');
                }
                
                // Special handling for scene_1014 - force re-enhancement when returning
                if (scene.key === 'scene_1014') {
                    log('Returning to scene_1014, forcing re-enhancement of table and profile');
                    // Clear the enhanced class to force re-enhancement
                    setTimeout(() => {
                        const table = document.querySelector('#view_2772 table');
                        if (table) {
                            table.classList.remove('enhanced');
                            table.style.opacity = '0';
                        }
                        // Clear the profile loaded class
                        const profileContainer = document.querySelector('#view_3204');
                        if (profileContainer) {
                            profileContainer.classList.remove('profile-loaded');
                            profileContainer.innerHTML = ''; // Clear any existing content
                        }
                        // Force reload of dynamicStaffTable1014
                        window[`_loading_dynamicStaffTable1014`] = false;
                        delete window.DYNAMIC_STAFF_TABLE_1014_CONFIG;
                    }, 100);
                }
                
                // CRITICAL: Remove all hashchange listeners to prevent conflicts
                // This prevents Vue apps from conflicting with each other
                const oldHashHandlers = window._vespaHashHandlers || [];
                oldHashHandlers.forEach(handler => {
                    window.removeEventListener('hashchange', handler);
                    log(`Removed hashchange listener from ${handler._vespaAppName || 'unknown app'}`);
                });
                window._vespaHashHandlers = [];
                
                // ENHANCED CLEANUP: Clear all app-specific loading states and config variables
                // when leaving a scene to prevent apps from loading on wrong scenes
                for (const appKey in APPS) {
                        const app = APPS[appKey];
                        
                        // Skip universal apps that should persist across scenes
                        if (appKey === 'generalHeader' || appKey === 'loginPageCustomizer' || appKey === 'questionnaireValidator') {
                            continue;
                        }
                        
                        // Check if the previous scene was one where this app should load
                        if (app.scenes.includes(lastRenderedSceneKey)) {
                            // Check if the new scene is NOT one where this app should load
                            if (!app.scenes.includes(scene.key) && !app.scenes.includes('all')) {
                                log(`Cleaning up ${appKey} when leaving scene ${lastRenderedSceneKey} for ${scene.key}`);
                                
                                // Clear loading flag
                                if (window[`_loading_${appKey}`]) {
                                    window[`_loading_${appKey}`] = false;
                                    log(`Cleared loading flag for ${appKey}`);
                                }
                                
                                // Clear global config variable
                                // Special handling for uploadSystem - don't try to clear VESPA_UPLOAD_CONFIG as it's a const
                                if (appKey === 'uploadSystem' && app.configGlobalVar === 'VESPA_UPLOAD_CONFIG') {
                                    log(`Skipping clear of VESPA_UPLOAD_CONFIG for ${appKey} (const cannot be reassigned)`);
                                } else if (app.configGlobalVar && window[app.configGlobalVar]) {
                                    window[app.configGlobalVar] = undefined;
                                    log(`Cleared global config ${app.configGlobalVar} for ${appKey}`);
                                }
                                
                                // If this was the loaded app, reset it
                                if (loadedAppKey === appKey) {
                                    loadedAppKey = null;
                                    log(`Reset loadedAppKey from ${appKey}`);
                                }
                            }
                        }
                    }

                    
                    // Legacy cleanup for backwards compatibility
                    if (loadedAppKey === 'generalHeader' || loadedAppKey === 'loginPageCustomizer' || loadedAppKey === 'questionnaireValidator') {
                        log(`Keeping ${loadedAppKey} loaded across scene change.`);
                    } else if (loadedAppKey) {
                        log(`Resetting loadedAppKey from ${loadedAppKey}.`);
                        loadedAppKey = null; // Reset to allow the new scene's app (or same app) to load/re-initialize
                    }
                }

                log(`Scene rendered: Storing scene key '${scene.key}'`);
                lastRenderedSceneKey = scene.key;
                
                // Handle landing page backgrounds and dashboard background
                const landingPageScenes = ['scene_1210', 'scene_1215', 'scene_1278']; // Updated to new resource scene
                const dashboardScene = 'scene_1225';
                const isLandingPage = landingPageScenes.includes(scene.key);
                const isDashboard = scene.key === dashboardScene;
                
                if (!isLandingPage && !isDashboard) {
                    // Remove landing page and dashboard backgrounds if we're not on those pages
                    log(`Removing special backgrounds for scene ${scene.key}`);
                    document.body.style.backgroundColor = '';
                    document.body.style.background = '';
                    document.body.style.backgroundImage = '';
                    document.body.style.backgroundAttachment = '';
                    document.body.style.minHeight = '';
                    document.body.classList.remove('landing-page-scene', 'dashboard-scene');
                    landingPageScenes.forEach(lpScene => {
                        document.body.classList.remove(`landing-page-${lpScene}`);
                    });
                    
                    // Remove from containers too
                    const containers = document.querySelectorAll('.kn-scene, .kn-scene-content, .kn-content, #kn-app-container');
                    containers.forEach(container => {
                        container.style.backgroundColor = '';
                        container.style.backgroundImage = '';
                    });
                }
                
                // Check if this completes the required pair OR if a special DOM condition is met
                tryLoadApp();
            } else {
                log("Scene render event fired, but no scene key found.");
            }
        });

        // Listener 2: Store view key and then check if conditions are met
        $(document).on('knack-view-render.any', function (event, view) {
            if (view && view.key) {
                // Do not reset loadedAppKey on mere view render, as a scene can have multiple views
                // and we might be loading an app that spans multiple views or depends on a specific scene-view combo.
                // The scene change logic above is better suited for resetting loadedAppKey.
                log(`View rendered: Storing view key '${view.key}'`);
                lastRenderedViewKey = view.key;
                // Check if this completes the required pair OR if a special DOM condition is met
                tryLoadApp();
            } else {
                log("View render event fired, but no view key found.");
            }
        });

        log("Knack render event listeners attached.");
        log("Loader setup complete. Waiting for render events.");

    });

    log("Knack Builder Loader setup registered. Waiting for DOM ready.");

})(); // end IIFE