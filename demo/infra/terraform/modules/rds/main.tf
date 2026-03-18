resource "aws_db_instance" "main" {
  identifier        = "acme-${var.env}"
  engine            = "postgres"
  engine_version    = "16.2"
  instance_class    = "db.t3.medium"
  allocated_storage = 100
  db_name           = "acme"
  username          = "acme"
  password          = var.db_password
  skip_final_snapshot = true
}
