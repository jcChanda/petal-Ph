(() => {
  const KEY = 'petal_ph_db_v3';
  const SESSION = 'petal_ph_session';
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){}
    if (!d) {
      d = { users: [{email:'petalphofficial@gmail.com',password:'admin1234567891235',role:'admin'}],
        products: [
          {id:'sunday-garden',name:'Sunday in the Garden',description:'Garden rose, sweet pea & seasonal greens',category:'bouquets',price:68,image:'assets/flower-menu.jpg',available:true,created_at:new Date().toISOString()},
          {id:'a-little-wild',name:'A Little Wild',description:'A flower-filled surprise, wrapped up with love',category:'seasonal',price:54,image:'assets/money-bouquet.jpg',available:true,created_at:new Date().toISOString()},
          {id:'golden-hour',name:'The Golden Hour',description:'Velvety blue roses in a statement arrangement',category:'bouquets',price:72,image:'assets/blue-roses.jpg',available:true,created_at:new Date().toISOString()},
          {id:'friday-flowers',name:'Flowers, Every Friday',description:'Classic ivory roses with a soft, lovely finish',category:'subscriptions',price:48,image:'assets/white-roses.jpg',available:true,created_at:new Date().toISOString()}
        ],
        orders: []
      };
      localStorage.setItem(KEY, JSON.stringify(d));
    }
    return d;
  }
  function save(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
  function session(){ try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch(e){ return null; } }
  function setSession(u){ localStorage.setItem(SESSION, JSON.stringify(u)); }
  function clearSession(){ localStorage.removeItem(SESSION); }
  function uuid(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);}); }
  function jsonRes(body,status=200){ return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}); }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init={}){
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(url, location.origin);
    if (!u.pathname.startsWith('/api/')) return origFetch(input, init);
    const path = u.pathname.replace(/^\/api/,'') || '/';
    const body = init.body ? JSON.parse(init.body) : {};
    const d = load();
    const user = session();

    // health
    if (method==='GET' && path==='/health') return jsonRes({status:'ok'});

    // auth
    if (method==='POST' && path==='/auth/register') {
      if (d.users.some(x=>x.email===body.email.toLowerCase())) return jsonRes({detail:'An account with this email already exists.'},409);
      const u={email:body.email.toLowerCase(),password:body.password,role:'customer'};
      d.users.push(u); save(d); setSession({email:u.email,role:u.role});
      return jsonRes({user:{email:u.email,role:u.role}},201);
    }
    if (method==='POST' && path==='/auth/login') {
      const u=d.users.find(x=>x.email===body.email.toLowerCase() && x.password===body.password);
      if(!u) return jsonRes({detail:'Email or password is incorrect.'},401);
      setSession({email:u.email,role:u.role});
      return jsonRes({user:{email:u.email,role:u.role}});
    }
    if (method==='POST' && path==='/auth/logout') { clearSession(); return jsonRes({status:'signed out'}); }
    if (method==='GET' && path==='/auth/me') return jsonRes({user: session()});
    if (method==='GET' && path==='/admin') {
      if(!user || user.role!=='admin') return jsonRes({detail:'Admin access is required.'},403);
      return jsonRes({email:user.email,role:user.role});
    }

    // products public
    if (method==='GET' && path==='/products') return jsonRes({products: d.products.map(p=>({...p,price:+p.price,available:!!p.available}))});

    // recommendations
    if (method==='POST' && path==='/recommendations') {
      const avail=d.products.filter(p=>p.available);
      if(!avail.length) return jsonRes({message:'There are no available flowers to recommend right now.',recommendations:[]});
      const recs=avail.slice(0,3).map(p=>({product:{...p,price:+p.price,available:!!p.available},reason:'A lovely pick for you.'}));
      return jsonRes({message:'Here are a few flowers you might love.',recommendations:recs});
    }

    // orders
    if (method==='POST' && path==='/orders') {
      const order=body;
      const quantities={};
      for(const it of order.items){ quantities[it.id]=(quantities[it.id]||0)+it.quantity; }
      const lineItems=[]; let subtotal=0;
      for(const pid in quantities){
        const prod=d.products.find(p=>p.id===pid);
        if(!prod) return jsonRes({detail:'A product in your bag is no longer available.'},400);
        if(!prod.available) return jsonRes({detail:prod.name+' is sold out.'},409);
        const lt=prod.price*quantities[pid]; subtotal+=lt;
        lineItems.push({id:prod.id,name:prod.name,quantity:quantities[pid],unit_price:prod.price,line_total:lt});
      }
      const o={id:uuid(),customer_name:order.customer_name,customer_phone:order.customer_phone,customer_email:order.customer_email,delivery_method:order.delivery_method,delivery_address:order.delivery_address||'',delivery_date:order.delivery_date||'',delivery_notes:order.delivery_notes||'',payment_method:order.payment_method,items:lineItems,subtotal,status:'new',created_at:new Date().toISOString()};
      d.orders.unshift(o); save(d);
      return jsonRes({order:{id:o.id,status:'new',subtotal}},201);
    }

    // admin products
    if (method==='GET' && path==='/admin/products') {
      if(!user||user.role!=='admin') return jsonRes({detail:'Admin access is required.'},403);
      return jsonRes({products: d.products.map(p=>({...p,price:+p.price,available:!!p.available}))});
    }
    if (method==='POST' && path==='/admin/products') {
      if(!user||user.role!=='admin') return jsonRes({detail:'Admin access is required.'},403);
      const p=body; const prod={id:uuid(),name:p.name,description:p.description,category:p.category,price:+p.price,image:p.image,available:p.available!==false,created_at:new Date().toISOString()};
      d.products.unshift(prod); save(d);
      return jsonRes({product:{...prod,price:+prod.price,available:!!prod.available}},201);
    }
    let m = path.match(/^\/admin\/products\/(.+)$/);
    if (m) {
      const pid=decodeURIComponent(m[1]);
      if(!user||user.role!=='admin') return jsonRes({detail:'Admin access is required.'},403);
      const idx=d.products.findIndex(p=>p.id===pid);
      if (method==='PUT') {
        if(idx<0) return jsonRes({detail:'Product not found.'},404);
        const p=body;
        d.products[idx]={...d.products[idx],name:p.name,description:p.description,category:p.category,price:+p.price,image:p.image,available:p.available!==false};
        save(d);
        return jsonRes({product:{...d.products[idx],price:+d.products[idx].price,available:!!d.products[idx].available}});
      }
      if (method==='PATCH') {
        if(idx<0) return jsonRes({detail:'Product not found.'},404);
        if(body.available!==undefined) d.products[idx].available=!!body.available;
        save(d);
        return jsonRes({product:{...d.products[idx],price:+d.products[idx].price,available:!!d.products[idx].available}});
      }
      if (method==='DELETE') {
        if(idx<0) return jsonRes({detail:'Product not found.'},404);
        d.products.splice(idx,1); save(d);
        return new Response(null,{status:204});
      }
    }

    // admin orders
    if (method==='GET' && path==='/admin/orders') {
      if(!user||user.role!=='admin') return jsonRes({detail:'Admin access is required.'},403);
      return jsonRes({orders: d.orders});
    }
    m = path.match(/^\/admin\/orders\/(.+)$/);
    if (m && method==='PATCH') {
      if(!user||user.role!=='admin') return jsonRes({detail:'Admin access is required.'},403);
      const oid=decodeURIComponent(m[1]);
      const o=d.orders.find(x=>x.id===oid);
      if(!o) return jsonRes({detail:'Order not found.'},404);
      o.status=body.status; save(d);
      return jsonRes({id:oid,status:body.status});
    }

    // order tracking
    if (method==='POST' && path==='/orders/track') {
      const o=d.orders.find(x=>x.id===body.order_reference && x.customer_email===String(body.customer_email||'').toLowerCase());
      if(!o) return jsonRes({detail:'Your order could not be found.'},404);
      return jsonRes({order:o});
    }

    // customer orders
    if (method==='GET' && path==='/customer/orders') {
      if(!user||user.role!=='customer') return jsonRes({detail:'Please sign in.'},401);
      return jsonRes({orders: d.orders.filter(o=>o.customer_email===user.email)});
    }
    if (method==='GET' && path==='/customer/order-notifications') {
      if(!user||user.role!=='customer') return jsonRes({detail:'Please sign in.'},401);
      const notifs=d.orders.filter(o=>o.customer_email===user.email).map(o=>({id:o.id,status:o.status}));
      return jsonRes({notifications:notifs});
    }
    if (method==='GET' && path==='/customer/reminders') {
      if(!user||user.role!=='customer') return jsonRes({detail:'Please sign in.'},401);
      const stored = localStorage.getItem('petal_reminder_'+user.email);
      return jsonRes({relationship_start_date: stored||null});
    }
    if (method==='PUT' && path==='/customer/reminders') {
      if(!user||user.role!=='customer') return jsonRes({detail:'Please sign in.'},401);
      if(body.relationship_start_date) localStorage.setItem('petal_reminder_'+user.email, body.relationship_start_date);
      else localStorage.removeItem('petal_reminder_'+user.email);
      return jsonRes({relationship_start_date: body.relationship_start_date||null});
    }

    return jsonRes({detail:'Not found'},404);
  };
})();
