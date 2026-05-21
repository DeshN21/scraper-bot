import * as cheerio from 'cheerio';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCFHL0MF_NhzbnRyUTNyCaHqVPEzylt66I",
  authDomain: "phoneprice-lk.firebaseapp.com",
  projectId: "phoneprice-lk",
  storageBucket: "phoneprice-lk.firebasestorage.app",
  messagingSenderId: "345176734905",
  appId: "1:345176734905:web:9a0075471fb38961acaf68"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BRANDS = ["Apple", "Samsung", "Xiaomi", "Vivo", "Oppo", "Nokia", "Realme", "Huawei", "Honor", "OnePlus"];
const MAX_PAGES = 5;

// Helper to wait
const delay = ms => new Promise(res => setTimeout(res, ms));

async function scrapePhones() {
  console.log("Starting Advanced Real-Time Scraper Bot (with ACTUAL stores)...");
  const phones = [];
  const phoneIds = new Set();
  
  try {
    for (const brand of BRANDS) {
      console.log(`Scraping brand: ${brand}...`);
      
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = page === 1 
            ? `https://www.ideabeam.com/mobile/brand/${brand.toLowerCase()}/`
            : `https://www.ideabeam.com/mobile/brand/${brand.toLowerCase()}?page=${page}`;
            
        console.log(` -> Fetching page ${page} of ${brand}...`);
        
        const response = await fetch(url);
        if(!response.ok) {
          if (page === 1) console.log(` Failed to fetch ${brand}`);
          break;
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let foundOnPage = 0;
        
        // Use a standard for loop to allow async detail fetching
        const links = $('a').toArray();
        for (const el of links) {
          const title = $(el).text().trim();
          const href = $(el).attr('href');
          
          if (title && title.toLowerCase().includes(brand.toLowerCase()) && title !== "View details »" && href && href.endsWith('-price.html')) {
            const parent = $(el).parent().parent();
            const parentText = parent.text().replace(/\s+/g, ' ');
            
            let img = parent.find('img').attr('src');
            if (!img) img = $(el).closest('.product, .item, .col-xs-12').find('img').attr('src');
            
            const priceMatch = parentText.match(/Rs\.\s*([\d,]+)/);
            
            if (priceMatch) {
              let minPrice = parseInt(priceMatch[1].replace(/,/g, ''));
              const id = title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
              
              if (!phoneIds.has(id) && minPrice > 0) {
                phoneIds.add(id);
                foundOnPage++;
                
                let finalImage = "";
                if (img) {
                  finalImage = img.startsWith('http') ? img : `https://www.ideabeam.com${img}`;
                } else {
                  finalImage = `https://fdn2.gsmarena.com/vv/bigpic/${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.jpg`;
                }
                
                const detailLink = href.startsWith('http') ? href : `https://www.ideabeam.com${href}`;
                
                // Fetch REAL stores from detail page
                let realStores = [];
                try {
                  await delay(200); // polite delay
                  const detailRes = await fetch(detailLink);
                  if (detailRes.ok) {
                    const detailHtml = await detailRes.text();
                    const $detail = cheerio.load(detailHtml);
                    
                    $detail('tr').each((i, rowEl) => {
                      const text = $detail(rowEl).text().trim().replace(/\s+/g, ' ');
                      if (text.includes('Rs.')) {
                        const parts = text.split('Rs.');
                        const storeName = parts[0].trim();
                        const priceText = parts[1].trim();
                        const storePrice = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
                        
                        if (storeName && storePrice > 0 && storeName.length < 25 && storeName !== "Price" && !storeName.includes("Warranty")) {
                          realStores.push({
                            id: storeName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + i,
                            name: storeName,
                            price: storePrice,
                            warranty: "Check Store",
                            address: "Sri Lanka",
                            contact: "Check Store"
                          });
                        }
                      }
                    });
                  }
                } catch(e) {
                  console.log(`Failed to fetch details for ${title}`);
                }
                
                // Recalculate true minPrice from real stores if they exist
                if (realStores.length > 0) {
                  minPrice = Math.min(...realStores.map(s => s.price));
                }
                
                // Only save phones that actually have stores
                if (realStores.length > 0) {
                  phones.push({
                    id: id,
                    name: title,
                    brand: brand,
                    minPrice: minPrice,
                    imageUrl: finalImage,
                    storeCount: realStores.length,
                    detailLink: detailLink,
                    specs: { ram: "Varies", storage: "Varies", battery: "Standard", display: "Standard" },
                    stores: realStores
                  });
                }
              }
            }
          }
        }
        
        if (foundOnPage === 0 && page > 1) {
          break;
        }
      }
    }

    console.log(`\nSuccessfully scraped ${phones.length} real phones with ACTUAL STORES! Saving to Firebase...`);
    
    let promises = [];
    let count = 0;
    for (const phone of phones) {
      const docRef = doc(collection(db, "phones"), phone.id);
      promises.push(setDoc(docRef, phone));
      count++;
      
      if (promises.length >= 50) {
        await Promise.all(promises);
        promises = [];
        console.log(`Saved ${count} phones so far...`);
      }
    }
    
    if (promises.length > 0) {
      await Promise.all(promises);
    }
    
    console.log(`Successfully updated live database with ${phones.length} REAL DATA items (with actual stores)!`);
    process.exit(0);
    
  } catch (error) {
    console.error("Scraper Error:", error);
    process.exit(1);
  }
}

scrapePhones();
