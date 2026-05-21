# db.py
import mysql.connector


def get_conn():
    return mysql.connector.connect(
        host="127.0.0.1",          
        user="root",          
        password="Republic_C207",  
        database="carbon_emission_db",
    )