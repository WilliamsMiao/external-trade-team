-- ===========================================
-- 外部贸易团队数据库初始化
-- ===========================================

-- 1. Agents 表
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL, -- coordinator/hr_trainer/sales_lead/supply_lead/ops_lead/finance_lead
    status VARCHAR(20) DEFAULT 'active', -- active/disabled/standby
    config JSONB DEFAULT '{}',
    capabilities TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agents_type ON agents(type);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_last_activity ON agents(last_activity);

-- 2. Customers 表
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    company VARCHAR(200),
    email VARCHAR(200),
    phone VARCHAR(50),
    country VARCHAR(100),
    credit_rating DECIMAL(3,2) DEFAULT 1.00,
    credit_limit DECIMAL(15,2) DEFAULT 0,
    tax_id VARCHAR(50),
    address TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_country ON customers(country);
CREATE INDEX idx_customers_created ON customers(created_at);

-- 3. Orders 表
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id),
    sales_agent_id INTEGER REFERENCES agents(id),
    status VARCHAR(30) DEFAULT 'pending', -- pending/confirmed/processing/shipped/delivered/cancelled
    order_type VARCHAR(20) DEFAULT 'export', -- export/import
    total_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_status VARCHAR(20) DEFAULT 'unpaid', -- unpaid/partially_paid/paid
    payment_terms VARCHAR(50),
    incoterms VARCHAR(10),
    port_loading VARCHAR(100),
    port_discharge VARCHAR(100),
    required_delivery DATE,
    actual_delivery DATE,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_order_id ON orders(order_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_sales ON orders(sales_agent_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- 4. Order Items (订单明细)
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_name VARCHAR(200) NOT NULL,
    sku VARCHAR(50),
    quantity DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20),
    unit_price DECIMAL(15,2) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- 5. Suppliers 表
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    company VARCHAR(200),
    contact_person VARCHAR(100),
    email VARCHAR(200),
    phone VARCHAR(50),
    country VARCHAR(100),
    category VARCHAR(100), -- raw_materials/components/packaging/logistics
    rating DECIMAL(2,1) DEFAULT 3.00,
    payment_terms VARCHAR(50),
    min_order_quantity DECIMAL(10,2),
    address TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_suppliers_country ON suppliers(country);
CREATE INDEX idx_suppliers_category ON suppliers(category);
CREATE INDEX idx_suppliers_rating ON suppliers(rating);

-- 6. Purchase Orders (采购订单)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) NOT NULL UNIQUE,
    supplier_id INTEGER REFERENCES suppliers(id),
    supply_agent_id INTEGER REFERENCES agents(id),
    status VARCHAR(30) DEFAULT 'draft', -- draft/confirmed/processing/shipped/received/cancelled
    total_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    expected_delivery DATE,
    actual_delivery DATE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_po_number ON purchase_orders(po_number);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_supply_agent ON purchase_orders(supply_agent_id);
CREATE INDEX idx_po_status ON purchase_orders(status);

-- 7. Shipments (物流)
CREATE TABLE IF NOT EXISTS shipments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    po_id INTEGER REFERENCES purchase_orders(id),
    tracking_number VARCHAR(100),
    carrier VARCHAR(50), -- fedex/dhl/ups/custom
    status VARCHAR(30) DEFAULT 'pending', -- pending/in_transit/delivered/customs_clearance/exception
    shipped_date DATE,
    estimated_arrival DATE,
    actual_arrival DATE,
    customs_entry_number VARCHAR(50),
    duties_amount DECIMAL(15,2),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);
CREATE INDEX idx_shipments_status ON shipments(status);

-- 8. Invoices (发票)
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    order_id INTEGER REFERENCES orders(id),
    customer_id INTEGER REFERENCES customers(id),
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'issued', -- issued/sent/paid/overdue/cancelled
    issue_date DATE,
    due_date DATE,
    paid_date DATE,
    payment_reference VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due ON invoices(due_date);

-- 9. Audit Log (业务操作日志)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50), -- order/customer/supplier/invoice/shipment
    target_id VARCHAR(50),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_agent ON audit_log(agent_id);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_action ON audit_log(action);

-- 10. Config Change Log (配置变更日志)
CREATE TABLE IF NOT EXISTS config_change_log (
    id SERIAL PRIMARY KEY,
    agent_name VARCHAR(100),
    change_type VARCHAR(50) NOT NULL, -- agent_config/system_config/workflow
    before_state JSONB,
    after_state JSONB,
    approved_by VARCHAR(100),
    reason TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_config_change_agent ON config_change_log(agent_name);
CREATE INDEX idx_config_change_type ON config_change_log(change_type);
CREATE INDEX idx_config_change_timestamp ON config_change_log(timestamp);

-- 11. Tasks (任务跟踪)
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_agent_id INTEGER REFERENCES agents(id),
    related_type VARCHAR(50), -- order/customer/supplier
    related_id INTEGER,
    priority VARCHAR(20) DEFAULT 'medium', -- low/medium/high/urgent
    status VARCHAR(20) DEFAULT 'pending', -- pending/in_progress/completed/cancelled
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_assigned ON tasks(assigned_agent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due ON tasks(due_date);

-- ===========================================
-- 初始化 Agent 记录
-- ===========================================
INSERT INTO agents (name, type, status, config) VALUES
    ('Coordinator', 'coordinator', 'active', '{"description": "跨部门任务协调中枢"}'),
    ('HR Trainer', 'hr_trainer', 'active', '{"description": "团队培训与知识管理"}'),
    ('Sales Lead', 'sales_lead', 'active', '{"description": "销售与客户关系管理"}'),
    ('Supply Lead', 'supply_lead', 'active', '{"description": "供应链与采购管理"}'),
    ('Ops Lead', 'ops_lead', 'active', '{"description": "运营与物流管理"}'),
    ('Finance Lead', 'finance_lead', 'active', '{"description": "财务与合规管理"}')
ON CONFLICT (name) DO NOTHING;

-- ===========================================
-- 创建更新时间戳函数
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为需要自动更新的表创建触发器
CREATE TRIGGER update_customers_timestamp BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_orders_timestamp BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_suppliers_timestamp BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_purchase_orders_timestamp BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_shipments_timestamp BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_timestamp BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
