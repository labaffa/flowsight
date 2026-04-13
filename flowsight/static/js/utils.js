export function getRemInPixels() {
    return parseFloat($('html').css('font-size'));
}

export function showInfoPopup(evt){
    if ($(this).hasClass('nav-link') && !$(this).hasClass('active')){
       return;
    }
    let popupId = $(this).attr('popup-id');
    let popup = $(`#${popupId}`);
    const popupPos = $(this).attr('popup-pos');
    let customOffset = {'top': 0, 'left': 0};

    switch (popupPos) {
        case 'bottom':
            customOffset['left'] = $(this).outerWidth()/2
    }
    
    const popupWidth = popup.outerWidth();
    const popupHeight = popup.outerHeight();

    const scrollTop = $(window).scrollTop();
    const scrollLeft = $(window).scrollLeft();

    // Ottieni le dimensioni della finestra
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Ottieni la posizione del click
    // const clickX = evt.clientX;
    // const clickY = evt.clientY;

    const triggerOffset = $(this).offset();

    const positionTop = triggerOffset.top - scrollTop;
    const positionLeft = triggerOffset.left - scrollLeft;


    // const clickX = triggerOffset.left; // Estremo sinistro del trigger
    // const clickY = triggerOffset.top + $(this).outerHeight() + window.scrollY; // Vertice basso del trigger 
    const clickX = positionLeft; // Estremo sinistro del trigger
    const clickY = positionTop + $(this).outerHeight(); // Vertice basso del trigger 


    // Calcola lo spazio disponibile
    const spaceRight = windowWidth - clickX;
    const spaceBottom = windowHeight - clickY;

    let top, left;

    
    // Determina dove posizionare il popup
    if (spaceRight >= popupWidth) {
        // C'è spazio a destra
        left = clickX + $(this).outerWidth() + scrollLeft + getRemInPixels() + customOffset['left'];
    } else {
        // Posiziona a sinistra del click
        left = clickX  - popupWidth + scrollLeft - getRemInPixels() + customOffset['left'];
    }

    if (spaceBottom >= popupHeight) {
        // C'è spazio in basso
        top = clickY + getRemInPixels() + scrollTop;
    } else {
        
        // Posiziona sopra il click
        top = positionTop - popupHeight - getRemInPixels() + scrollTop;
    }
    
    
    popup.css({
        display: 'block',
        //   top: `${evt.clientY + window.scrollY}px`,
        //   left: `${evt.clientX + window.scrollX}px`,
        top: `${top}px`,
        left: `${left}px`
    });
    console.log(
        {
            'space bottom': spaceBottom,
            'space right': spaceRight,
            'click x': clickX,
            'click y': clickY,
            'popup height': popupHeight,
            'popup width': popupWidth,
            'top': top,
            'left': left,
            'position top': positionTop,
            'position left': positionLeft,
            'scroll top': scrollTop,
            'scroll left': scrollLeft,
            'trigger offset': triggerOffset

           
        }
    )

    // setTimeout(function() {
    //     console.log('timoutj')
    //     if ($(this).hasClass('hover')) {
    //         console.log('ciao')
    //         popup.css({
    //             display: 'block',
    //             //   top: `${evt.clientY + window.scrollY}px`,
    //             //   left: `${evt.clientX + window.scrollX}px`,
    //             top: `${top + window.scrollY}px`,
    //             left: `${left + window.scrollX}px`
    //         });
    //     }
    // }, 600); // Delay di 300ms    
}

export function hideInfoPopup(evt){
    let popupId = $(this).attr('popup-id');
    let popup = $(`#${popupId}`);
    popup.css('display', 'none');
    // if (!popup.is(event.target) && !popup.has(event.target).length){
    //      popup.css('display', 'none');}
}
