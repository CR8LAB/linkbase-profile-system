import "./App.css";

function App() {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand">
          <h1>LinkBase</h1>
          <p>DIGITAL BUSINESS MANAGEMENT</p>
        </div>

        <div className="login-heading">
          <h2>Welcome back</h2>
          <p>Sign in to manage your profiles.</p>
        </div>

        <form>
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input type="email" id="email" placeholder="Enter your email" />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
            />
          </div>

          <button type="submit">Sign in</button>
        </form>

        <p className="login-footer">Secure administrator access</p>
      </div>
    </main>
  );
}

export default App;
