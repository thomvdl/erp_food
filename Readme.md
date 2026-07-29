## Datebase table

- Role
name
slug

- Users
username
password
email  
barcode

- Role_user
user_id
role_id

- Station 
name 
slug

- Passe 
name 
slug 
station_id

- Payement_method 
name
slug

- Taxe
slug
value 

- Product_Categories 
name
slug

- Product_Catalogs 
name
slug
active

- Product 
name
slug
description
price 
sku
active
taxe_id
station_id
product_categories_id
product_catalogs_id

- Client 
firstname
lastname
email
phone

- Room
name
slug

- Tables 
type
label
pos_left
pos_top
width
height 
room_id

- Order 
id
state (Send -> Ask -> Do -> Seed -> Done)
client_id
table_id

- Order_section
name
ticket_id

- Order_line 
quantity 
product_id 
order_section_id

- Ticket 
id
paid_at
client_id
table_id

- Ticket_section
name
ticket_id

- Ticket_line
quantity 
product_id
ticket_section  

- Ticket_payements
value  
Payement_method_id
ticket_id

- event 
name
slug

- event_dates
date 
start_hour
event_id
room _id (opt)
number_place_limit (opt)

- Booking
client_id
number_of_guests
type: breakfast, lunch, dinner
date 
hour 

- Cash_sessions 
user_id
open_at
opening_amount
close_at
closing_amount
expected_amount
discrepancy
closed_by_user_id
note

## ERP_APP 
- Dashboard 
    1. Afficher des stats

- POS - Vente direct 
    1. Vente direct de produit 
    2. Prossibilité de selectioner un client (opt)
    3. Paiements

- POS - Restaurant 
    1. Affiche les plans de salles avec un selecteur de salle et la possibilite d'ouvrir une table avec le nombre de personne
    2. Afficher le POS une fois que la tables est ouverte pour vraiment séléctioner des produits 
    3. Selectioner des produit et les séparer en section pourvoir ajouter des sections (section 1, section 2, ..)

- Event 
    1. Vendre des place (lier à un client) pour un event créer un code de validation possibiliter de l'envoyer par email
    2. Liste de place vendue avec modiffier et supprimer
    3. Valider la présance de avec le code de validation et lui attribuer une place (si placement strict, room_id est dispo)
    4. Affichage d'une salle avec les place prise (room)

- Reservation
    1. Enregistre un reservation (Client, type, date, heure tous les quart d'heure, nombre de personne)
    Type enum (Petit dejeuener - dejeuner - souper)
    2. Liste des reservation avec tri et filtre par jour 
    3. Valider la reservation d'un client 

- Product 
    1. Gestion des produit en vente 
    2. Possibiliter de tri et de filtre

- Ouverture / Fermeture de caisse
    1. Ouverture la session montant du cash 
    2. Fermeture validation du cash et des autre montant de paiement 
    3. Liste des fermeture avec detail

- Params 
    1. Gérer les tables (position des table , ajout de salle)
    2. Gérer les catégories des produits 
    3. Gérer les catalogue de produit (Acviver un catalogue)
    4. Gérer les utilisateur et les différants roles 
    5. Gestion des produit 

## EEP Validate event 
- Sectioner un event 
- Valider les place par qr code 
- Placer les gens si event avec placement 

##  Todo 
Définir ce qui est disponible de faire avec les differant role user 

Ne pas tester