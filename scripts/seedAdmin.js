// Loads .env, or the file in DOTENV_CONFIG_PATH (used by seedProduction.js)
import 'dotenv/config';
if ((process.env.ADMIN_PASSWORD ?? '').length < 12) {
  console.error('ADMIN_PASSWORD must be set in .env and be at least 12 characters.');
  process.exit(1);
}
import connectDB from '../config/db.js';
import User from '../models/User.js';

const seedAdmin = async () => {
  try {
    await connectDB();


    const adminData = {
      name: process.env.ADMIN_NAME || 'Admin User',
      email: process.env.ADMIN_EMAIL || 'admin@cinema.com',
      password: process.env.ADMIN_PASSWORD ,
      role: 'ADMIN',
    };

    const existing = await User.findOne({ email: adminData.email });
    if (existing) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    await User.create(adminData);
    console.log('Admin user created successfully');
    process.exit(0);
  } catch (error) {
    // Only the message: a full error could include the connection string
    console.error('Failed to seed admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
