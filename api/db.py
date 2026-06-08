# db.py
import os
import mysql.connector

def get_conn():
    return mysql.connector.connect(
        host="gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
        port=4000,
        user="3Ldn8dvRqE6tKJp.root",
        password="O7kqZLpRQi8D3jsu",
        database="defaultdb",
        ssl_ca="C:\\Users\\24024145\\Downloads\\isrgrootx1.pem",
        ssl_verify_cert=True
    )
