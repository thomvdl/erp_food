## Datebase table

-- Role
name
slug

-- Users
username
password
email  
barcode

-- Role_user
user_id
role_id

-- Station 
name 
slug

-- Passe 
name 
slug 
station_id

-- Payement_method 
name
slug

-- Taxe
slug
value 

-- Product_Categories 
name
slug

-- Product_Catalogs 
name
slug
active


-- Product 
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

-- Client 
firstname
lastname
email
phone

-- Room
name
slug

-- Tables 
type
label
pos_left
pos_top
width
height 
room_id

-- Order 
id
state (Send -> Ask -> Do -> Seed -> Done)
client_id
table_id

-- Order_section
name
ticket_id

-- Order_line 
quantity 
product_id 
order_section_id

-- Ticket 
id
paid_at
client_id
table_id

-- Ticket_section
name
ticket_id

-- Ticket_line
quantity 
product_id
ticket_section  

-- Ticket_payements
value  
Payement_method_id
ticket_id


## Section
POS Restaurant 
Client 
Param
    -- Taxe
    -- Room
    -- Catalogue 
    -- Category
    -- User 
    -- Role
    -- Product 


## Page 

-- Dashboard 

-- POS - Restaurant 
    1. Affiche les plans de salles avec un selecteur de salle et la possibilite d'ouvrir une table avec le nombre de personne
    2. Afficher le POS une fois que la tables est ouverte pour vraiment séléctioner des produits 
    3. Selectioner des produit et les séparer en section pourvoir ajouter des section 
    

-- Product 
    Gestion des produit en vente 

-- Params 
    Gérer les tables (position des table , ajout de salle)
    Gérer les catégories des produits 
    Gérer les catalogue de produit (Acviver un catalogue)
    Gérer les utilisateur et les différants roles 
    Gestion des produit 


##  Todo 

