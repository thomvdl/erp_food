export interface Station {
  id: number;
  name: string;
  slug: string;
  /** "C'est dans station qu'on doit pouvoir choisir dans quelle passe ça doit aller" (voir Readme.md). */
  passe_id: number | null;
}

/** "Ça passe dans le bon passe" (voir Readme.md) — plusieurs stations peuvent partager un même passe (stations.passe_id). */
export interface Passe {
  id: number;
  name: string;
  slug: string;
}

export interface Product {
  id: number;
  name: string;
  station_id: number | null;
  /** Minutes — voir erp-app > Produits. Null si non renseigné, pas de minuteur affiché dans ce cas. */
  preparation_time: number | null;
}

export interface OrderLine {
  id: number;
  quantity: number;
  note: string | null;
  product_id: number;
  order_section_id: number;
  /** Suivi par ligne, pas par section entière (voir Readme.md : une section peut mélanger des postes différents). */
  done: boolean;
  /** Idem pour "Envoyer" — une section peut aussi mélanger deux passes différents. */
  sent: boolean;
  product?: Product;
}

export interface OrderSection {
  id: number;
  name: string | null;
  order_id: number;
  /** Cycle kitchen display (voir Readme.md, mêmes noms que orders.state) : en_attente -> send (valider) -> ask (demander en cuisine) -> do (fait) -> seed (envoyer, section par section). */
  state: 'en_attente' | 'send' | 'ask' | 'do' | 'seed' | 'done';
  /** Horodatage de la transition vers 'ask' — sert de départ au minuteur de préparation (voir
   *  kitchen-board.ts). Null pour une section jamais passée par 'ask' (encore en_attente/send). */
  asked_at: string | null;
  lines: OrderLine[];
}

export interface TableElement {
  id: number;
  label: string;
  room_id: number;
  room?: { id: number; name: string };
}

export interface Order {
  id: number;
  /** Cycle global de la commande (voir Readme.md) : send -> ask -> do -> seed -> done. */
  state: 'send' | 'ask' | 'do' | 'seed' | 'done';
  table_id: number | null;
  /** Uniquement pour les commandes kiosque (voir KioskOrderController côté API) — le numéro du
   *  Ticket déjà encaissé/imprimé côté client, à annoncer au comptoir pour remettre la bonne
   *  commande au bon client. Toujours null pour une commande de table classique. */
  ticket_id: number | null;
  number_of_guests: number | null;
  table?: TableElement | null;
  sections: OrderSection[];
}
