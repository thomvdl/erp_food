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
taxe_id

-- Product 
name
slug
description
price 
sku
active
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
state (Validate -> Ask -> Do -> Seed -> Done)
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
Product 
Param
    -- Taxe
    -- Room
    -- Catalogue 
    -- Category
    -- User 
    -- Role

