/* CartVanta GA4 setup.
   Add the Measurement ID supplied by Google Analytics (format: G-XXXXXXXXXX).
   Until configured, no analytics request or tracking cookie is created. */
window.CARTVANTA_GA_ID = '';
(function(){
  const id=String(window.CARTVANTA_GA_ID||'').trim();
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  if(!/^G-[A-Z0-9]+$/.test(id)) return;
  const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);document.head.appendChild(s);
  window.gtag('js',new Date());window.gtag('config',id,{send_page_view:true});
})();
window.cvTrack=function(name,params){
  const allowed=['view_item_list','select_item','view_item','search','view_cart','add_to_cart','remove_from_cart','begin_checkout','add_shipping_info','add_payment_info','purchase','refund'];
  if(!allowed.includes(name)) return;
  const payload=params||{};
  window.dataLayer=window.dataLayer||[];
  window.dataLayer.push({event:name,ecommerce:payload});
  if(typeof window.gtag==='function') window.gtag('event',name,payload);
};