# db.py
import mysql.connector


def get_conn():
    return mysql.connector.connect(
        host="fyp-mysql-db-myrp-ac11.g.aivencloud.com",
        port=27226,
        user="avnadmin",
        password="AVNS_E5TJdiiOvowUaEzLNMq",
        database="defaultdb",
        ssl_ca="ca.pem"
    )
